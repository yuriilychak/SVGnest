use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Int32Array};

pub mod clipper;
pub mod constants;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;

use crate::nesting::pair_flow::pair_data;

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
pub fn polygon_area_i32(points: &[i32]) -> f64 {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_node_inner_basic() {
        // Create a simple square polygon
        let mem_seg = vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];

        let result = clean_node_inner(&mem_seg, 0.01);

        // Should return a non-empty result
        assert!(!result.is_empty());

        // Should have 4 points (8 coordinates)
        assert_eq!(result.len(), 8);
    }

    #[test]
    fn test_clean_node_inner_with_duplicates() {
        // Create a polygon with duplicate/close points that should be cleaned
        let mem_seg = vec![
            0.0, 0.0, 0.0001, 0.0001, // Very close to first point
            10.0, 0.0, 10.0, 10.0, 0.0, 10.0,
        ];

        let result = clean_node_inner(&mem_seg, 0.01);

        // Should return cleaned polygon with fewer points
        assert!(!result.is_empty());
        // The duplicate point should be removed
        assert!(result.len() < mem_seg.len());
    }

    #[test]
    fn test_clean_node_inner_empty_input() {
        let mem_seg: Vec<f32> = vec![];

        let result = clean_node_inner(&mem_seg, 0.01);

        // Should return empty for empty input
        assert!(result.is_empty());
    }

    #[test]
    fn test_clean_node_inner_too_small() {
        // Polygon with only 1 point
        let mem_seg = vec![0.0, 0.0];

        let result = clean_node_inner(&mem_seg, 0.01);

        // Should return empty for invalid polygon
        assert!(result.is_empty());
    }

    #[test]
    fn test_offset_node_inner_zero_spacing() {
        // With zero spacing, should just normalize the polygon
        let mem_seg = vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];

        let result = offset_node_inner(&mem_seg, 1, 0, 0.01);

        // Should return normalized result (same point count)
        assert!(!result.is_empty());
        assert_eq!(result.len(), 8);
    }

    #[test]
    fn test_offset_node_inner_positive_spacing() {
        // With positive spacing, should offset outward
        let mem_seg = vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0];

        let result = offset_node_inner(&mem_seg, 1, 2, 0.01);

        // Should return some result
        assert!(!result.is_empty());
    }

    #[test]
    fn test_offset_node_inner_negative_spacing() {
        // With negative spacing, should offset inward
        let mem_seg = vec![0.0, 0.0, 100.0, 0.0, 100.0, 100.0, 0.0, 100.0];

        let result = offset_node_inner(&mem_seg, -1, 5, 0.01);

        // Result may be empty or have offset polygon - just verify no panic
        let _ = result.len();
    }
}
