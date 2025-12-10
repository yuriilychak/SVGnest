use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Int32Array};

pub mod clipper;
pub mod constants;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;

use crate::nesting::pair_flow::pair_data;
use crate::nesting::polygon_node::PolygonNode;

use crate::clipper::clipper::Clipper;
use crate::clipper::clipper_offset::ClipperOffset;
use crate::clipper::constants::CLIPPER_SCALE;
use crate::clipper::enums::{ClipType, PolyFillType, PolyType};
use crate::clipper::utils as clipper_utils;
use crate::geometry::point::Point;
use crate::geometry::polygon::Polygon;
use crate::utils::almost_equal::AlmostEqual;
use crate::utils::bit_ops::*;
use crate::utils::math::*;
use crate::utils::mid_value::MidValue;
use crate::utils::number::Number;

#[wasm_bindgen]
pub fn polygon_area(points: &[f32]) -> f64 {
    return Number::polygon_area(points);
}

#[wasm_bindgen]
pub fn almost_equal(a: f64, b: f64, tolerance: f64) -> bool {
    a.almost_equal(b, Some(tolerance))
}

#[wasm_bindgen]
pub fn set_bits_u32(source: u32, value: u16, index: u8, bit_count: u8) -> u32 {
    set_bits(source, value, index, bit_count)
}

#[wasm_bindgen]
pub fn get_bits_u32(source: u32, index: u8, num_bits: u8) -> u16 {
    get_bits(source, index, num_bits)
}

#[wasm_bindgen]
pub fn get_u16_from_u32(source: u32, index: u8) -> u16 {
    get_u16(source, index)
}

#[wasm_bindgen]
pub fn join_u16_to_u32(value1: u16, value2: u16) -> u32 {
    join_u16(value1, value2)
}

#[wasm_bindgen]
pub fn cycle_index_wasm(index: usize, size: usize, offset: isize) -> usize {
    cycle_index(index, size, offset)
}

#[wasm_bindgen]
pub fn to_rotation_index_wasm(angle: u16, rotation_split: u16) -> u16 {
    to_rotation_index(angle, rotation_split)
}

#[wasm_bindgen]
pub fn mid_value_f64(value: f64, left: f64, right: f64) -> f64 {
    value.mid_value(left, right)
}

#[wasm_bindgen]
pub fn pair_data_f32(buff: &[f32]) -> Float32Array {
    let serialzed: Vec<f32> = unsafe { pair_data(buff) };

    let out = Float32Array::new_with_length(serialzed.len() as u32);

    out.copy_from(&serialzed);

    out
}

fn from_i32_mem_seg(mem_seg: &[i32]) -> Vec<Point<i32>> {
    debug_assert!(
        mem_seg.len() % 2 == 0,
        "mem_seg length must be even (pairs of x,y)"
    );

    let count = mem_seg.len() / 2;
    let mut out = Vec::with_capacity(count);

    for chunk in mem_seg.chunks_exact(2) {
        let x = chunk[0];
        let y = chunk[1];
        out.push(Point::<i32>::new(Some(x), Some(y)));
    }

    out
}

pub fn pack_points_to_i32(nested: &[Vec<Point<i32>>]) -> Vec<i32> {
    let m = nested.len();
    let total_points: usize = nested.iter().map(|v| v.len()).sum();
    let header_len = 1 + m; // m count + m offsets
    let data_len = total_points * 2; // x,y per point
    let total_len = header_len + data_len;

    // Preallocate once. Fill header first, then data.
    let mut out = Vec::with_capacity(total_len);
    out.resize(header_len, 0);
    out[0] = m as i32;

    // Fill offsets (relative to start of data section).
    let mut running: usize = 0;
    for (i, arr) in nested.iter().enumerate() {
        out[1 + i] = running as i32;
        running += arr.len() * 2; // each point contributes 2 ints
    }

    // Append data: [x0,y0, x1,y1, ...]
    for arr in nested {
        for p in arr {
            out.push(p.x);
            out.push(p.y);
        }
    }

    debug_assert_eq!(out.len(), total_len);
    out
}

fn pack_polygon_to_i32(polygon: &Vec<Point<i32>>) -> Vec<i32> {
    let mut out = Vec::with_capacity(polygon.len() * 2);
    for p in polygon {
        out.push(p.x);
        out.push(p.y);
    }
    out
}

#[wasm_bindgen]
pub fn clean_polygon_wasm(buff: &[i32], distance: f64) -> Int32Array {
    let polygon = from_i32_mem_seg(buff);
    let cleaned_polygon = clipper_utils::clean_polygon(&polygon, distance);
    let packed = pack_polygon_to_i32(&cleaned_polygon);
    let out = Int32Array::new_with_length(packed.len() as u32);
    out.copy_from(&packed);
    out
}

/// Cleans a polygon by performing a union operation and returning the largest resulting polygon
///
/// # Arguments
/// * `mem_seg` - Flat array of f32 values representing points (x0, y0, x1, y1, ...)
/// * `curve_tolerance` - Tolerance for cleaning coincident points and edges
///
/// # Returns
/// Cleaned polygon as a flat Vec<f32>, or empty vector if cleaning fails
pub fn clean_node_inner(mem_seg: &[f32], curve_tolerance: f64) -> Vec<f32> {
    // Return empty if input is invalid
    if mem_seg.len() < 6 || mem_seg.len() % 2 != 0 {
        return Vec::new();
    }

    // Convert from memory segment to clipper polygon (scaled i32 points)
    let clipper_polygon = clipper_utils::from_mem_seg(mem_seg, None, false);

    // Perform union operation to simplify the polygon
    let mut simple: Vec<Vec<Point<i32>>> = Vec::new();
    let mut clipper = Clipper::new(false, true);

    clipper.add_path(&clipper_polygon, PolyType::Subject);
    clipper.execute(ClipType::Union, &mut simple, PolyFillType::NonZero);

    // Return empty if no result
    if simple.is_empty() {
        return Vec::new();
    }

    // Find the biggest polygon by area
    let mut biggest_index = 0;
    let mut biggest_area = 0.0f64;

    for (i, polygon) in simple.iter().enumerate() {
        // Convert to flat i32 array for area calculation
        let packed = pack_polygon_to_i32(polygon);
        let area = i32::abs_polygon_area(&packed);

        if area > biggest_area {
            biggest_area = area;
            biggest_index = i;
        }
    }

    let biggest = &simple[biggest_index];

    // Clean up singularities, coincident points and edges
    let cleaned_polygon =
        clipper_utils::clean_polygon(biggest, curve_tolerance * (CLIPPER_SCALE as f64));

    // Return empty if cleaning removed all points
    if cleaned_polygon.is_empty() {
        return Vec::new();
    }

    // Convert back to memory segment (f32 array)
    clipper_utils::to_mem_seg(&cleaned_polygon)
}

#[wasm_bindgen]
pub fn clean_node_inner_wasm(buff: &[f32], curve_tolerance: f64) -> Float32Array {
    let result = clean_node_inner(buff, curve_tolerance);
    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// Offset a polygon node and normalize it
///
/// # Arguments
/// * `mem_seg` - Flat array of f32 values representing points (x0, y0, x1, y1, ...)
/// * `sign` - Sign of the offset (1 or -1)
/// * `spacing` - Spacing value for offset
/// * `curve_tolerance` - Tolerance for cleaning coincident points and edges
///
/// # Returns
/// Normalized and offset polygon as a flat Vec<f32>, or the normalized input if spacing is 0
pub fn offset_node_inner(
    mem_seg: &[f32],
    sign: i32,
    spacing: i32,
    curve_tolerance: f64,
) -> Vec<f32> {
    let mut res_mem_seg = mem_seg.to_vec();

    if spacing != 0 {
        let offset = 0.5 * (spacing as f32) * (sign as f32);
        let path = clipper_utils::from_mem_seg(mem_seg, None, false);

        let mut clipper_offset = ClipperOffset::new();
        let offset_scaled = (offset * (CLIPPER_SCALE as f32)) as i32;
        let result_path = clipper_offset.execute(&path, offset_scaled);

        if result_path.len() != 1 {
            // Error case - return empty or handle error
            // In TypeScript it throws an error, but we'll return empty for Rust
            return Vec::new();
        }

        res_mem_seg = clipper_utils::to_mem_seg(&result_path[0]);

        // Clean the result
        let cleaned = clean_node_inner(&res_mem_seg, curve_tolerance);

        if !cleaned.is_empty() {
            res_mem_seg = cleaned;
        }
    }

    // Normalize the polygon
    let point_count = res_mem_seg.len() / 2;
    if point_count < 3 {
        return res_mem_seg;
    }

    let mut polygon = Polygon::<f32>::new();
    unsafe {
        polygon.bind(res_mem_seg.clone().into_boxed_slice(), 0, point_count);

        if let Some(normalized) = polygon.normalize() {
            return normalized.to_vec();
        }
    }

    res_mem_seg
}

#[wasm_bindgen]
pub fn offset_node_inner_wasm(
    buff: &[f32],
    sign: i32,
    spacing: i32,
    curve_tolerance: f64,
) -> Float32Array {
    let result = offset_node_inner(buff, sign, spacing, curve_tolerance);
    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// Deserialize polygon data from flat i32 array
///
/// Format: [polygon_count, size1, size2, ..., sizeN, x0, y0, x1, y1, ...]
///
/// # Arguments
/// * `data` - Flat array containing polygon count, sizes, and coordinates
///
/// # Returns
/// Vector of polygons, where each polygon is a vector of Point<i32>
fn deserialize_polygons(data: &[i32]) -> Vec<Vec<Point<i32>>> {
    if data.is_empty() {
        return Vec::new();
    }

    let polygon_count = data[0] as usize;
    if polygon_count == 0 || data.len() < 1 + polygon_count {
        return Vec::new();
    }

    let mut result = Vec::with_capacity(polygon_count);
    let mut data_index = 1 + polygon_count; // Skip count + all sizes

    for i in 0..polygon_count {
        let size = data[1 + i] as usize;
        let point_count = size / 2;

        if data_index + size > data.len() {
            // Invalid data - not enough coordinates
            break;
        }

        let mut polygon = Vec::with_capacity(point_count);
        for j in 0..point_count {
            let x = data[data_index + j * 2];
            let y = data[data_index + j * 2 + 1];
            polygon.push(Point::new(Some(x), Some(y)));
        }

        result.push(polygon);
        data_index += size;
    }

    result
}

/// Serialize polygons to flat i32 array
///
/// Format: [polygon_count, size1, size2, ..., sizeN, x0, y0, x1, y1, ...]
///
/// # Arguments
/// * `polygons` - Vector of polygons to serialize
///
/// # Returns
/// Flat array containing polygon count, sizes, and coordinates
fn serialize_polygons(polygons: &Vec<Vec<Point<i32>>>) -> Vec<i32> {
    let polygon_count = polygons.len();

    if polygon_count == 0 {
        return vec![0];
    }

    // Calculate total size needed
    let mut total_coords = 0;
    for polygon in polygons.iter() {
        total_coords += polygon.len() * 2; // x, y for each point
    }

    let mut result = Vec::with_capacity(1 + polygon_count + total_coords);

    // Write polygon count
    result.push(polygon_count as i32);

    // Write sizes
    for polygon in polygons.iter() {
        result.push((polygon.len() * 2) as i32); // Size in coordinates (x, y pairs)
    }

    // Write coordinates
    for polygon in polygons.iter() {
        for point in polygon.iter() {
            result.push(point.x);
            result.push(point.y);
        }
    }

    result
}

/// Apply NFPs with offset and filter by area threshold (WASM wrapper)
///
/// # Arguments
/// * `nfp_buffer` - Float32Array containing serialized NFP data
/// * `offset_x` - X coordinate of the offset point
/// * `offset_y` - Y coordinate of the offset point
///
/// # Returns
/// Int32Array with filtered polygons in format: [polygon_count, size1, size2, ..., x0, y0, x1, y1, ...]
#[wasm_bindgen]
pub fn apply_nfps_wasm(nfp_buffer: &[f32], offset_x: f32, offset_y: f32) -> Int32Array {
    let offset = Point::new(Some(offset_x), Some(offset_y));
    let result = clipper_utils::apply_nfps(nfp_buffer.to_vec(), &offset);
    let serialized = serialize_polygons(&result);

    let out = Int32Array::new_with_length(serialized.len() as u32);
    out.copy_from(&serialized);
    out
}

/// Get placement result from placements and path items (WASM wrapper)
///
/// This function takes placement data (x,y positions) and path items (polygon identifiers)
/// and packs them into a compact Float32Array format for efficient transfer.
///
/// # Arguments
/// * `placements_buffer` - Float32Array containing flattened placements data
///   Format: [count, size1, ...placements1..., size2, ...placements2..., ...]
/// * `path_items_buffer` - Uint32Array containing flattened path items data
///   Format: [count, size1, ...items1..., size2, ...items2..., ...]
/// * `fitness` - Fitness score for this result
///
/// # Returns
/// Float32Array with format:
/// - [0]: fitness score
/// - [1]: placement count
/// - [2..2+count]: merged size/offset info for each placement
/// - [remaining]: packed path items and placements data
#[wasm_bindgen]
pub fn get_result_wasm(
    placements_buffer: &[f32],
    path_items_buffer: &[u32],
    fitness: f32,
) -> Float32Array {
    // Deserialize placements
    let mut placements: Vec<Vec<f32>> = Vec::new();
    let mut offset = 0;

    if placements_buffer.len() > 0 {
        let count = placements_buffer[0] as usize;
        offset = 1;

        for _ in 0..count {
            if offset >= placements_buffer.len() {
                break;
            }
            let size = placements_buffer[offset] as usize;
            offset += 1;

            if offset + size > placements_buffer.len() {
                break;
            }

            let placement = placements_buffer[offset..offset + size].to_vec();
            placements.push(placement);
            offset += size;
        }
    }

    // Deserialize path items
    let mut path_items: Vec<Vec<u32>> = Vec::new();
    offset = 0;

    if path_items_buffer.len() > 0 {
        let count = path_items_buffer[0] as usize;
        offset = 1;

        for _ in 0..count {
            if offset >= path_items_buffer.len() {
                break;
            }
            let size = path_items_buffer[offset] as usize;
            offset += 1;

            if offset + size > path_items_buffer.len() {
                break;
            }

            let items = path_items_buffer[offset..offset + size].to_vec();
            path_items.push(items);
            offset += size;
        }
    }

    // Call get_result from place_flow module
    let result = crate::nesting::place_flow::get_result(&placements, &path_items, fitness);

    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// WASM wrapper for get_placement_data function
///
/// Arguments:
/// - final_nfp_buffer: Flattened array containing final NFP polygons
///   Format: [polygon_count, polygon1_size, ...polygon1_points_as_i32..., polygon2_size, ...]
/// - nodes_buffer: Float32Array buffer containing serialized PolygonNode data
///   Format: [node_count, ...node_data...] (placed nodes + current node as last element)
/// - placement_buffer: Float32Array of placement positions (x, y pairs)
/// - first_point_x: X coordinate of first point
/// - first_point_y: Y coordinate of first point
/// - input_y: Input Y position
///
/// Returns: Float32Array with [minWidth, positionY] or [minWidth, positionY, positionX]
#[wasm_bindgen]
pub fn get_placement_data_wasm(
    final_nfp_buffer: &[i32],
    nodes_buffer: &[f32],
    placement_buffer: &[f32],
    first_point_x: f32,
    first_point_y: f32,
    input_y: f32,
) -> Float32Array {
    use crate::geometry::point::Point;
    use crate::nesting::polygon_node::PolygonNode;

    // Deserialize final_nfp using existing deserialize_polygons
    let final_nfp = deserialize_polygons(final_nfp_buffer);

    // Read node count from first item and deserialize all nodes (placed + current node)
    let node_count = nodes_buffer[0].to_bits().swap_bytes() as usize;
    let (all_nodes, _) = PolygonNode::deserialize_nodes(nodes_buffer, 1, node_count);

    // Split nodes: last one is the current node, rest are placed nodes
    let node_count = all_nodes.len();
    let placed = &all_nodes[..node_count - 1];
    let node = &all_nodes[node_count - 1];

    let first_point = Point::new(Some(first_point_x), Some(first_point_y));

    // Call get_placement_data
    let result = crate::nesting::place_flow::get_placement_data(
        &final_nfp,
        placed,
        node,
        placement_buffer,
        &first_point,
        input_y,
    );

    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// Generate NFP cache key from two polygon nodes (WASM wrapper)
///
/// # Arguments
/// * `rotation_split` - Number of rotation splits (used to calculate rotation index)
/// * `inside` - Whether this is an inside NFP
/// * `source1` - Source ID of first polygon
/// * `rotation1` - Rotation of first polygon
/// * `source2` - Source ID of second polygon
/// * `rotation2` - Rotation of second polygon
///
/// # Returns
/// u32 cache key packed with polygon sources, rotation indices, and inside flag
#[wasm_bindgen]
pub fn generate_nfp_cache_key_wasm(
    rotation_split: u32,
    inside: bool,
    source1: i32,
    rotation1: f32,
    source2: i32,
    rotation2: f32,
) -> u32 {
    let polygon1 = PolygonNode::new(source1, rotation1, Vec::new());
    let polygon2 = PolygonNode::new(source2, rotation2, Vec::new());

    PolygonNode::generate_nfp_cache_key(rotation_split, inside, &polygon1, &polygon2)
}

/// WASM wrapper for get_final_nfps function
///
/// Arguments:
/// - buffer: Uint8Array containing serialized PlaceContent data
/// - nodes_buffer: Float32Array buffer containing serialized PolygonNode data (placed nodes + path node as last)
/// - bin_nfp_buffer: Float32Array buffer containing serialized bin NFP data
/// - placement_buffer: Float32Array of placement positions (x, y pairs)
///
/// Returns: Int32Array with final NFP polygons in format: [polygon_count, size1, size2, ..., sizeN, x0, y0, x1, y1, ...]
#[wasm_bindgen]
pub fn get_final_nfps_wasm(
    buffer: &[u8],
    nodes_buffer: &[f32],
    bin_nfp_buffer: &[f32],
    placement_buffer: &[f32],
) -> Int32Array {
    use crate::nesting::nfp_wrapper::NFPWrapper;
    use crate::nesting::place_content::PlaceContent;
    use crate::nesting::polygon_node::PolygonNode;

    // Initialize PlaceContent from buffer
    let mut place_content = PlaceContent::new();
    place_content.init(buffer);

    // Read node count from first item and deserialize all nodes (placed + path node)
    let node_count = nodes_buffer[0].to_bits().swap_bytes() as usize;
    let (all_nodes, _) = PolygonNode::deserialize_nodes(nodes_buffer, 1, node_count);

    // Split nodes: last one is the path node, rest are placed nodes
    let node_count = all_nodes.len();
    let placed = &all_nodes[..node_count - 1];
    let path = &all_nodes[node_count - 1];

    // Create NFPWrapper from bin NFP buffer
    let bin_nfp = NFPWrapper::new(bin_nfp_buffer);

    // Call get_final_nfps
    let result = crate::nesting::place_flow::get_final_nfps(
        &place_content,
        placed,
        path,
        &bin_nfp,
        placement_buffer,
    );

    // Serialize result
    let serialized = serialize_polygons(&result);
    let out = Int32Array::new_with_length(serialized.len() as u32);
    out.copy_from(&serialized);
    out
}

/// WASM wrapper for get_first_placement function
///
/// Arguments:
/// - nfp_buffer: Float32Array buffer containing serialized NFP data
/// - first_point_x: X coordinate of first point
/// - first_point_y: Y coordinate of first point
///
/// Returns: Float32Array with [positionX, positionY]
#[wasm_bindgen]
pub fn get_first_placement_wasm(
    nfp_buffer: &[f32],
    first_point_x: f32,
    first_point_y: f32,
) -> Float32Array {
    use crate::geometry::point::Point;

    let first_point = Point::new(Some(first_point_x), Some(first_point_y));
    let result = crate::nesting::place_flow::get_first_placement(nfp_buffer, &first_point);

    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// WASM wrapper for place_paths function
///
/// Arguments:
/// - buffer: Uint8Array containing serialized PlaceContent data
///
/// Returns: Float32Array containing placement result
#[wasm_bindgen]
pub fn place_paths_wasm(buffer: &[u8]) -> Float32Array {
    let result = crate::nesting::place_flow::place_paths(buffer);
    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}
