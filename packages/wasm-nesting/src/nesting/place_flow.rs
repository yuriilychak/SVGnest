use crate::utils::bit_ops::join_u16;
use crate::utils::math::write_uint32_to_f32;

const NFP_INFO_START_INDEX: usize = 2;

pub fn get_result(placements: &[Vec<f32>], path_items: &[Vec<u32>], fitness: f32) -> Vec<f32> {
    let placement_count = path_items.len();
    let mut info = vec![0u32; placement_count];
    let mut total_size = NFP_INFO_START_INDEX + placement_count;
    let mut merged_size: u32;
    let mut offset: usize;
    let mut size: usize;

    for i in 0..placement_count {
        size = path_items[i].len();
        merged_size = join_u16(size as u16, total_size as u16);
        info[i] = merged_size;
        total_size += size * 3;
    }

    let mut result = vec![0.0f32; total_size];

    result[0] = fitness;
    result[1] = placement_count as f32;

    for i in 0..placement_count {
        merged_size = info[i];
        offset = (merged_size >> 16) as usize;
        size = (merged_size & 0xFFFF) as usize;

        write_uint32_to_f32(&mut result, NFP_INFO_START_INDEX + i, merged_size);

        for j in 0..size {
            write_uint32_to_f32(&mut result, offset + j, path_items[i][j]);
        }

        result[offset + size..offset + size + placements[i].len()].copy_from_slice(&placements[i]);
    }

    result
}
