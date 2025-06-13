use wasm_bindgen::prelude::*;
use web_sys::js_sys::Float32Array;

pub mod constants;
pub mod geometry;
pub mod nest_config;
pub mod nesting;
pub mod utils;

use crate::geometry::point_pool::PointPool;
use crate::geometry::polygon::Polygon;
use crate::nesting::pair_content::PairContent;
use crate::nesting::pair_flow::{pair_data};
use crate::utils::wasm_logger::wasm_log;

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

fn serialize_loops(loops_f32: Vec<Vec<f32>>) -> Float32Array {
    let n = loops_f32.len();
    let total_len: usize = 1 + n + loops_f32.iter().map(|v| v.len()).sum::<usize>();

    let mut flat = Vec::with_capacity(total_len);
    flat.push(n as f32);
    for v in &loops_f32 {
        flat.push(v.len() as f32);
    }
    for v in &loops_f32 {
        flat.extend_from_slice(v);
    }

    let out = Float32Array::new_with_length(flat.len() as u32);
    out.copy_from(&flat);
    out
}

#[wasm_bindgen]
pub fn pair_data_f32(buff: &[f32]) -> Float32Array {
    let serialzed: Vec<f32> = unsafe { pair_data(buff) };

    let out = Float32Array::new_with_length(serialzed.len() as u32);

    out.copy_from(&serialzed);

    out
}