use wasm_bindgen::prelude::*;
use web_sys::js_sys::Float32Array;

pub mod constants;
pub mod geometry;
pub mod nesting;
pub mod utils;

use crate::geometry::point_pool::PointPool;
use crate::geometry::polygon::Polygon;
use crate::nesting::pair_flow::{no_fit_polygon, pair_inside};

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
pub fn no_fit_polygon_f64(
    poly_a_coords: &[f64],
    poly_b_coords: &[f64],
    inside: bool,
) -> Float32Array {
    let count_a = poly_a_coords.len() / 2;
    let buf_a = poly_a_coords.to_vec().into_boxed_slice();
    let mut polygon_a = Polygon::<f64>::new();
    unsafe { polygon_a.bind(buf_a, 0, count_a) };

    let count_b = poly_b_coords.len() / 2;
    let buf_b = poly_b_coords.to_vec().into_boxed_slice();
    let mut polygon_b = Polygon::<f64>::new();
    unsafe { polygon_b.bind(buf_b, 0, count_b) };

    let mut pool = PointPool::<f64>::new();

    let mut scan_polygon = Polygon::<f32>::new();

    let mut mem_seg = vec![0.0_f64; 1024];

    let loops_f32: Vec<Vec<f32>> = unsafe {
        no_fit_polygon(
            &mut pool,
            &mut scan_polygon,
            &mut polygon_a,
            &mut polygon_b,
            &mut mem_seg,
            inside,
        )
    };

    let out = serialize_loops(loops_f32);

    out
}

#[wasm_bindgen]
pub fn pair_inside_f64(
    poly_a_coords: &[f64],
    poly_b_coords: &[f64],
) -> Float32Array {
    let count_a = poly_a_coords.len() / 2;
    let buf_a = poly_a_coords.to_vec().into_boxed_slice();
    let mut polygon_a = Polygon::<f64>::new();
    unsafe { polygon_a.bind(buf_a, 0, count_a) };

    let count_b = poly_b_coords.len() / 2;
    let buf_b = poly_b_coords.to_vec().into_boxed_slice();
    let mut polygon_b = Polygon::<f64>::new();
    unsafe { polygon_b.bind(buf_b, 0, count_b) };

    let mut pool = PointPool::<f64>::new();

    let mut scan_polygon = Polygon::<f32>::new();

    let mut mem_seg = vec![0.0_f64; 1024];

    let loops_f32: Vec<Vec<f32>> = unsafe {
        pair_inside(
            &mut pool,
            &mut scan_polygon,
            &mut polygon_a,
            &mut polygon_b,
            &mut mem_seg,
        )
    };

    let out = serialize_loops(loops_f32);

    out
}
