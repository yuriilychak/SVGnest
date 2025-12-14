use wasm_bindgen::prelude::*;
use web_sys::js_sys::{self, Float32Array, Int32Array, Uint8Array};

pub mod clipper;
pub mod clipper_wrapper;
pub mod constants;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;

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
pub fn abs_polygon_area(points: &[f32]) -> f64 {
    return Number::abs_polygon_area(points);
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
        // Convert to flat array for area calculation
        let mut flat: Vec<i32> = Vec::with_capacity(polygon.len() * 2);
        for p in polygon {
            flat.push(p.x);
            flat.push(p.y);
        }
        let area = i32::abs_polygon_area(&flat);

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
