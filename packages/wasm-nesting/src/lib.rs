use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Int32Array};

pub mod clipper;
pub mod constants;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;

use crate::nesting::pair_flow::pair_data;

use crate::clipper::utils::clean_polygon;
use crate::geometry::point::Point;
use utils::almost_equal::AlmostEqual;
use utils::bit_ops::*;
use utils::math::*;
use utils::mid_value::MidValue;
use utils::number::Number;

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

fn from_mem_seg(mem_seg: &[f32]) -> Vec<Point<i32>> {
    const SCALE: f32 = 100.0;

    debug_assert!(
        mem_seg.len() % 2 == 0,
        "mem_seg length must be even (pairs of x,y)"
    );

    let count = mem_seg.len() / 2;
    let mut out = Vec::with_capacity(count);

    for chunk in mem_seg.chunks_exact(2) {
        // Scale and round to nearest, then cast to i32.
        let x = (chunk[0] * SCALE).round() as i32;
        let y = (chunk[1] * SCALE).round() as i32;
        out.push(Point::<i32>::new(Some(x), Some(y)));
    }

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
    let cleaned_polygon = clean_polygon(&polygon, distance);
    let packed = pack_polygon_to_i32(&cleaned_polygon);
    let out = Int32Array::new_with_length(packed.len() as u32);
    out.copy_from(&packed);
    out
}