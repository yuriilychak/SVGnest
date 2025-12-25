use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Uint8Array};

pub mod clipper;
pub mod clipper_wrapper;
pub mod constants;
pub mod genetic_algorithm;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;
pub mod wasm_packer;

use crate::nesting::polygon_node::PolygonNode;

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
pub fn abs_polygon_area(points: &[f32]) -> f64 {
    return Number::abs_polygon_area(points);
}

#[wasm_bindgen]
pub fn rotate_polygon_wasm(polygon: &[f32], angle: f32) -> Float32Array {
    let mut result = polygon.to_vec();
    f32::rotate_polygon(&mut result, angle);
    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

#[wasm_bindgen]
pub fn calculate_bounds_wasm(polygon: &[f32]) -> Float32Array {
    let size = polygon.len() >> 1;
    let bounds = f32::calculate_bounds(polygon, 0, size);
    let out = Float32Array::new_with_length(4);
    out.copy_from(&bounds);
    out
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
pub fn get_u16_from_u32(source: u32, index: u8) -> u16 {
    get_u16(source, index)
}

#[wasm_bindgen]
pub fn cycle_index_wasm(index: usize, size: usize, offset: isize) -> usize {
    cycle_index(index, size, offset)
}

#[wasm_bindgen]
pub fn mid_value_f64(value: f64, left: f64, right: f64) -> f64 {
    value.mid_value(left, right)
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

/// WASM wrapper for calculate function
///
/// Main calculation function that routes to either pair_data or place_paths
/// based on the thread type in the buffer.
///
/// Port of TypeScript calculate function from worker-flow/index.ts
///
/// Arguments:
/// - buffer: Uint8Array where first 4 bytes (u32 big-endian) indicate thread type
///   - 0 = PAIR (calls pair_data)
///   - 1 = PLACEMENT (calls place_paths)
///
/// Returns: Float32Array containing result from either pair_data or place_paths
#[wasm_bindgen]
pub fn calculate_wasm(buffer: &[u8]) -> Float32Array {
    let result = crate::nesting::calculate::calculate(buffer);
    let out = Float32Array::new_with_length(result.len() as u32);
    out.copy_from(&result);
    out
}

/// Generate polygon tree from flat arrays
///
/// Arguments:
/// - values: Float32Array containing flattened polygon coordinates [x1, y1, x2, y2, ...]
/// - sizes: Uint16Array containing point counts for each polygon
/// - spacing: Offset spacing value (u8)
/// - curve_tolerance: Curve tolerance for cleaning/offsetting (f32)
///
/// Returns: Uint8Array containing serialized PolygonNode tree
#[wasm_bindgen]
pub fn generate_tree_wasm(
    values: &[f32],
    sizes: &[u16],
    spacing: u8,
    curve_tolerance: f32,
) -> Uint8Array {
    let nodes =
        clipper_wrapper::generate_tree(values, sizes, spacing as i32, curve_tolerance as f64);
    let serialized = PolygonNode::serialize_nodes(&nodes, 0);

    let result = Uint8Array::new_with_length(serialized.len() as u32);
    result.copy_from(&serialized);
    result
}

/// Generate bounds for a bin polygon
///
/// Arguments:
/// - mem_seg: Float32Array containing polygon coordinates [x1, y1, x2, y2, ...]
/// - spacing: Offset spacing value (i32)
/// - curve_tolerance: Curve tolerance for cleaning/offsetting (f32)
///
/// Returns: Float32Array with structure:
/// [boundsX, boundsY, boundsWidth, boundsHeight,
///  resultBoundsX, resultBoundsY, resultBoundsWidth, resultBoundsHeight,
///  area, ...serialized_node]
#[wasm_bindgen]
pub fn generate_bounds_wasm(mem_seg: &[f32], spacing: i32, curve_tolerance: f32) -> Float32Array {
    match clipper_wrapper::generate_bounds(mem_seg, spacing, curve_tolerance as f64) {
        Some((bounds, result_bounds, area, node)) => {
            // Serialize the node
            let nodes = vec![node];
            let serialized = PolygonNode::serialize_nodes(&nodes, 0);

            // Calculate total size: 9 floats + serialized bytes (as f32 array)
            // We need to convert bytes to f32 count
            let serialized_f32_count = (serialized.len() + 3) / 4; // Round up to next f32
            let total_size = 9 + serialized_f32_count;
            let mut result_vec = vec![0f32; total_size];

            // Fill in bounds data
            unsafe {
                result_vec[0] = bounds.x();
                result_vec[1] = bounds.y();
                result_vec[2] = bounds.width();
                result_vec[3] = bounds.height();
                result_vec[4] = result_bounds.x();
                result_vec[5] = result_bounds.y();
                result_vec[6] = result_bounds.width();
                result_vec[7] = result_bounds.height();
            }
            result_vec[8] = area as f32;

            // Copy serialized data as bytes into the f32 array
            let bytes_slice = unsafe {
                std::slice::from_raw_parts_mut(
                    result_vec[9..].as_mut_ptr() as *mut u8,
                    serialized.len(),
                )
            };
            bytes_slice.copy_from_slice(&serialized);

            let out = Float32Array::new_with_length(result_vec.len() as u32);
            out.copy_from(&result_vec);
            out
        }
        None => Float32Array::new_with_length(0),
    }
}
