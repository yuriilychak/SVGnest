use crate::clipper::constants::CLIPPER_SCALE;
use crate::clipper::utils::{apply_nfps, get_combined_nfps, get_final_nfp};
use crate::geometry::point::Point;
use crate::nesting::nfp_wrapper::NFPWrapper;
use crate::nesting::place_content::PlaceContent;
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

/// Get first placement position by finding leftmost point in bin NFP
/// Takes byte buffer (ArrayBuffer representation) instead of f32 buffer
pub fn get_first_placement(nfp_buffer: &[u8], first_point: &Point<f32>) -> Vec<f32> {
    let mut position_x = f32::NAN;
    let mut position_y = f32::NAN;

    // Read NFP count from buffer (little-endian u32 at byte offset 4)
    if nfp_buffer.len() < 8 {
        return vec![position_x, position_y];
    }

    let nfp_count =
        u32::from_le_bytes([nfp_buffer[4], nfp_buffer[5], nfp_buffer[6], nfp_buffer[7]]) as usize;

    let mut byte_offset = NFP_INFO_START_INDEX * 4; // Convert to byte offset

    for _ in 0..nfp_count {
        if byte_offset + 4 > nfp_buffer.len() {
            break;
        }

        // Read compressed info (offset and size)
        let compressed_info = u32::from_le_bytes([
            nfp_buffer[byte_offset],
            nfp_buffer[byte_offset + 1],
            nfp_buffer[byte_offset + 2],
            nfp_buffer[byte_offset + 3],
        ]);
        byte_offset += 4;

        use crate::utils::bit_ops::get_u16;
        let data_offset = get_u16(compressed_info, 1) as usize * 4; // Convert to byte offset
        let size = get_u16(compressed_info, 0) as usize;
        let point_count = size >> 1;

        if data_offset + size * 4 > nfp_buffer.len() {
            continue;
        }

        for j in 0..point_count {
            let x_offset = data_offset + (j << 1) * 4;
            let y_offset = x_offset + 4;

            if y_offset + 4 > nfp_buffer.len() {
                break;
            }

            let x = f32::from_le_bytes([
                nfp_buffer[x_offset],
                nfp_buffer[x_offset + 1],
                nfp_buffer[x_offset + 2],
                nfp_buffer[x_offset + 3],
            ]) - first_point.x;

            let y = f32::from_le_bytes([
                nfp_buffer[y_offset],
                nfp_buffer[y_offset + 1],
                nfp_buffer[y_offset + 2],
                nfp_buffer[y_offset + 3],
            ]) - first_point.y;

            if position_x.is_nan() || x < position_x {
                position_x = x;
                position_y = y;
            }
        }
    }

    vec![position_x, position_y]
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
    let mut cur_area: f32;
    let mut tmp_point = Point::<f32>::new(None, None);

    for j in 0..final_nfp.len() {
        let nfp_size = final_nfp[j].len();
        let mem_seg1 = to_mem_seg(&final_nfp[j]);

        if f32::abs_polygon_area(&mem_seg1) < 2.0 {
            continue;
        }

        for k in 0..nfp_size {
            let mut buffer = Vec::new();

            for m in 0..placed.len() {
                tmp_point.x = placement[m << 1];
                tmp_point.y = placement[(m << 1) + 1];
                buffer.extend(fill_point_mem_seg(&placed[m], &tmp_point));
            }

            tmp_point.x = mem_seg1[k << 1] - first_point.x;
            tmp_point.y = mem_seg1[(k << 1) + 1] - first_point.y;

            buffer.extend(fill_point_mem_seg(node, &tmp_point));

            let mem_seg2 = buffer.into_boxed_slice();
            let point_count = mem_seg2.len() >> 1;

            let bounds = f32::calculate_bounds(&mem_seg2, 0, point_count);
            // weigh width more, to help compress in direction of gravity
            cur_area = bounds[2] * 2.0 + bounds[3];

            if min_area.is_nan()
                || cur_area < min_area
                || (min_area.almost_equal(cur_area, Some(f32::tol()))
                    && (min_x.is_nan() || tmp_point.x < min_x))
            {
                min_area = cur_area;
                min_width = bounds[2];
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

/// Convert NFPWrapper to clipper format (Vec<Vec<Point<i32>>>)
fn nfp_to_clipper(nfp_wrapper: &NFPWrapper) -> Vec<Vec<Point<i32>>> {
    let nfp_count = nfp_wrapper.count();
    let mut result = Vec::with_capacity(nfp_count);

    for i in 0..nfp_count {
        let mem_seg = nfp_wrapper.get_nfp_mem_seg(i);
        let point_count = mem_seg.len() >> 1;
        let mut polygon = Vec::with_capacity(point_count);

        for j in 0..point_count {
            let x = (mem_seg[j << 1] * CLIPPER_SCALE as f32).round() as i32;
            let y = (mem_seg[(j << 1) + 1] * CLIPPER_SCALE as f32).round() as i32;
            polygon.push(Point { x, y });
        }

        result.push(polygon);
    }

    result
}

/// Get final NFPs by combining placed nodes' NFPs and subtracting from bin NFP
/// Rust port of ClipperWrapper.getFinalNfps
pub fn get_final_nfps(
    place_content: &PlaceContent,
    placed: &[PolygonNode],
    path: &PolygonNode,
    bin_nfp: &NFPWrapper,
    placement: &[f32],
) -> Vec<Vec<Point<i32>>> {
    let mut total_nfps: Vec<Vec<Point<i32>>> = Vec::new();

    // Collect and apply all NFPs from placed nodes
    for (i, placed_node) in placed.iter().enumerate() {
        let key = PolygonNode::generate_nfp_cache_key(
            place_content.rotations(),
            false,
            placed_node,
            path,
        );

        if let Some(nfp_cache_value) = place_content.nfp_cache().get(&key) {
            // Convert Vec<u8> to Vec<f32>
            let f32_count = nfp_cache_value.len() / 4;
            let mut f32_buffer = Vec::with_capacity(f32_count);

            for j in 0..f32_count {
                let offset = j * 4;
                f32_buffer.push(f32::from_le_bytes([
                    nfp_cache_value[offset],
                    nfp_cache_value[offset + 1],
                    nfp_cache_value[offset + 2],
                    nfp_cache_value[offset + 3],
                ]));
            }

            // Get offset point from placement
            let offset_x = placement[i << 1];
            let offset_y = placement[(i << 1) + 1];
            let offset = Point {
                x: offset_x,
                y: offset_y,
            };

            // Apply NFPs with offset and add to total
            let applied = apply_nfps(f32_buffer, &offset);
            total_nfps.extend(applied);
        }
    }

    // Combine all NFPs using union
    let combined_nfp = get_combined_nfps(&total_nfps);

    if combined_nfp.is_empty() {
        return Vec::new();
    }

    // Convert bin NFP to clipper format
    let clipper_bin_nfp = nfp_to_clipper(bin_nfp);

    // Get final NFP by subtracting combined NFP from bin NFP
    get_final_nfp(&combined_nfp, &clipper_bin_nfp)
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

/// Port of TypeScript placePaths function
/// Main placement algorithm that packs polygons into bins
pub fn place_paths(buffer: &[u8]) -> Vec<f32> {
    let mut place_content = PlaceContent::new();
    place_content.init(buffer);

    let mut first_point = Point::<f32> { x: 0.0, y: 0.0 };
    let mut placements: Vec<Vec<f32>> = Vec::new();
    let mut path_items: Vec<Vec<u32>> = Vec::new();
    let mut placement: Vec<f32> = Vec::new();
    let mut path_item: Vec<u32> = Vec::new();
    let mut position_y: f32 = 0.0;
    let mut fitness: f32 = 0.0;
    let mut min_width: f32 = 0.0;
    let mut placed: Vec<PolygonNode> = Vec::new();

    while place_content.node_count() > 0 {
        placed.clear();
        placement.clear();
        path_item.clear();
        fitness += 1.0; // add 1 for each new bin opened (lower fitness is better)

        let node_count = place_content.node_count();

        for i in 0..node_count {
            let node = place_content.node_at(i).clone();

            // Get first point from node's mem_seg
            if node.mem_seg.len() >= 2 {
                first_point.x = node.mem_seg[0];
                first_point.y = node.mem_seg[1];
            }

            let path_key = place_content.get_path_key(i);

            // Get bin NFP
            let bin_nfp_option = place_content.get_bin_nfp(i);
            if bin_nfp_option.is_none() {
                continue;
            }

            let bin_nfp_bytes = bin_nfp_option.unwrap();
            let bin_nfp = NFPWrapper::new(bin_nfp_bytes);

            // Part unplaceable, skip
            if bin_nfp.is_broken() || place_content.get_nfp_error(&placed, &node) {
                continue;
            }

            if placed.is_empty() {
                let placement_data = get_first_placement(bin_nfp_bytes, &first_point);

                if placement_data.len() >= 2 {
                    position_y = placement_data[1];

                    path_item.push(path_key);
                    placement.push(placement_data[0]);
                    placement.push(placement_data[1]);
                    placed.push(node.clone());
                }

                continue;
            }

            // Get final NFP
            let final_nfp = get_final_nfps(&place_content, &placed, &node, &bin_nfp, &placement);

            if final_nfp.is_empty() {
                continue;
            }

            // Get placement data
            let placement_data = get_placement_data(
                &final_nfp,
                &placed,
                &node,
                &placement,
                &first_point,
                position_y,
            );

            min_width = placement_data[0];
            position_y = placement_data[1];

            if placement_data.len() == 3 {
                placed.push(node.clone());
                path_item.push(path_key);
                placement.push(placement_data[2]);
                placement.push(placement_data[1]);
            }
        }

        if min_width != 0.0 {
            fitness += min_width / place_content.area();
        }

        // Remove placed nodes
        for placed_node in &placed {
            place_content.remove_node(placed_node);
        }

        if placement.is_empty() {
            break; // something went wrong
        }

        placements.push(placement.clone());
        path_items.push(path_item.clone());
    }

    // There were parts that couldn't be placed
    fitness += (place_content.node_count() << 1) as f32;

    get_result(&placements, &path_items, fitness)
}
