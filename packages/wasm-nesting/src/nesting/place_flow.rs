use crate::clipper::constants::CLIPPER_SCALE;
use crate::geometry::point::Point;
use crate::geometry::polygon::Polygon;
use crate::nesting::polygon_node::PolygonNode;
use crate::utils::almost_equal::AlmostEqual;
use crate::utils::bit_ops::join_u16;
use crate::utils::math::write_uint32_to_f32;
use crate::utils::number::Number;

const NFP_INFO_START_INDEX: usize = 2;

/// Convert Int32Array polygon points to f32 memory segment, scaling down by CLIPPER_SCALE
fn to_mem_seg(polygon: &[Point<i32>]) -> Vec<f32> {
    let point_count = polygon.len();
    let mut result = vec![0.0f32; point_count << 1];
    let scale = CLIPPER_SCALE as f32;

    for i in 0..point_count {
        result[i << 1] = polygon[i].x as f32 / scale;
        result[(i << 1) + 1] = polygon[i].y as f32 / scale;
    }

    result
}

/// Fill point memory segment from a polygon node with an offset
fn fill_point_mem_seg(node: &PolygonNode, offset: &Point<f32>) -> Vec<f32> {
    let mut result = Vec::new();
    let point_count = node.mem_seg.len() >> 1;

    for i in 0..point_count {
        result.push(node.mem_seg[i << 1] + offset.x);
        result.push(node.mem_seg[(i << 1) + 1] + offset.y);
    }

    result
}

pub fn get_placement_data(
    final_nfp: &Vec<Vec<Point<i32>>>,
    placed: &[PolygonNode],
    node: &PolygonNode,
    placement: &[f32],
    first_point: &Point<f32>,
    input_y: f32,
) -> Vec<f32> {
    let mut position_x = f32::NAN;
    let mut position_y = input_y;
    let mut min_width = 0.0f32;
    let mut min_area = f32::NAN;
    let mut min_x = f32::NAN;

    for nfp in final_nfp {
        let nfp_size = nfp.len();
        let mem_seg1 = to_mem_seg(&nfp);
        let mut polygon1 = Polygon::<f32>::new();
        unsafe { polygon1.bind(mem_seg1.into_boxed_slice(), 0, nfp_size) };

        let abs_area = unsafe { polygon1.abs_area() };
        if abs_area < 2.0 {
            continue;
        }

        for k in 0..nfp_size {
            let mut buffer = Vec::new();

            for m in 0..placed.len() {
                let tmp_point = Point::new(Some(placement[m << 1]), Some(placement[(m << 1) + 1]));
                buffer.extend(fill_point_mem_seg(&placed[m], &tmp_point));
            }

            let pt = unsafe { polygon1.at(k) };
            let mut tmp_point = unsafe { Point::from(pt) };
            unsafe { tmp_point.sub(first_point) };

            buffer.extend(fill_point_mem_seg(node, &tmp_point));

            let mem_seg2 = buffer.into_boxed_slice();
            let mut polygon2 = Polygon::<f32>::new();
            unsafe { polygon2.bind(mem_seg2, 0, 0) };

            let size = unsafe { polygon2.size() };
            let cur_area = unsafe { (*size).x * 2.0 + (*size).y };

            if min_area.is_nan()
                || cur_area < min_area
                || (min_area.almost_equal(cur_area, Some(f32::tol()))
                    && (min_x.is_nan() || tmp_point.x < min_x))
            {
                min_area = cur_area;
                min_width = unsafe { (*size).x };
                position_x = tmp_point.x;
                position_y = tmp_point.y;
                min_x = tmp_point.x;
            }
        }
    }

    if !position_x.is_nan() {
        vec![min_width, position_y, position_x]
    } else {
        vec![min_width, position_y]
    }
}

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
