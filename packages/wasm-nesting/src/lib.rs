use std::arch::wasm32::*;
use wasm_bindgen::prelude::*;
use web_sys::js_sys::{Float32Array, Float64Array};

pub mod constants;
pub mod geometry;
pub mod nesting;
pub mod utils;

use crate::geometry::point::Point;
use crate::geometry::point_pool::PointPool;
use crate::geometry::polygon::Polygon;
use crate::nesting::pair_flow::{ no_fit_polygon_rectangle, no_fit_polygon };

use utils::almost_equal::AlmostEqual;
use utils::bit_ops::*;
use utils::math::*;
use utils::mid_value::MidValue;

fn wrap(index: usize, offset: usize, len: usize) -> usize {
    return (index + offset) % len;
}

#[wasm_bindgen]
pub fn polygon_area(points: &[f32]) -> f32 {
    let len = points.len();

    if len < 6 || len & 1 != 0 {
        return 0.0;
    }

    let n_points = len >> 1;
    let simd_pairs = n_points >> 1;
    let mut acc = f32x4_splat(0.0);
    let mut x0: f32;
    let mut y0: f32;
    let mut x1: f32;
    let mut y1: f32;
    let mut x2: f32;
    let mut y2: f32;
    let mut base: usize;
    let mut stack1: v128;
    let mut stack2: v128;

    for i in 0..simd_pairs {
        base = i << 2;
        x0 = points[wrap(base, 0, len)];
        y0 = points[wrap(base, 1, len)];
        x1 = points[wrap(base, 2, len)];
        y1 = points[wrap(base, 3, len)];
        x2 = points[wrap(base, 4, len)];
        y2 = points[wrap(base, 5, len)];

        stack1 = f32x4(y0, -x0, y1, -x1);
        stack2 = f32x4(x1, y1, x2, y2);
        acc = f32x4_add(acc, f32x4_mul(stack1, stack2));
    }

    return 0.5
        * (f32x4_extract_lane::<0>(acc)
            + f32x4_extract_lane::<1>(acc)
            + f32x4_extract_lane::<2>(acc)
            + f32x4_extract_lane::<3>(acc)
            + ((n_points & 1) as f32)
                * (points[len - 1] * points[0] - points[len - 2] * points[1]));
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
pub fn no_fit_polygon_rectangle_f64(poly_a: &[f64], poly_b: &[f64]) -> Float32Array {
    // Розмір у точках (дві координати на точку)
    let count_a = poly_a.len() / 2;
    let count_b = poly_b.len() / 2;

    // Створюємо Box<[f64]> для A і B, щоб передати в Polygon
    let buf_a: Box<[f64]> = poly_a.to_vec().into_boxed_slice();
    let mut polygon_a = Polygon::<f64>::new();

    unsafe {
        polygon_a.bind(buf_a, 0, count_a);
    }

    let buf_b: Box<[f64]> = poly_b.to_vec().into_boxed_slice();
    let mut polygon_b = Polygon::<f64>::new();

    unsafe {
        polygon_b.bind(buf_b, 0, count_b);
    }

    let mut pool = PointPool::<f64>::new();

    let vec_rects: Vec<[f32; 8]> = unsafe {
        no_fit_polygon_rectangle(
            &mut pool,
            &mut polygon_a as *mut Polygon<f64>,
            &mut polygon_b as *mut Polygon<f64>,
        )
    };

    // Якщо результат порожній, повертаємо пустий Float32Array
    if vec_rects.is_empty() {
        Float32Array::new_with_length(0)
    } else {
        // vec_rects містить рівно один елемент [f32; 8]
        let arr = &vec_rects[0];
        let result = Float32Array::new_with_length(8);
        result.copy_from(arr);
        result
    }
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

    let n = loops_f32.len();
    let total_len: usize = 1
        + n
        + loops_f32.iter().map(|v| v.len()).sum::<usize>();

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
