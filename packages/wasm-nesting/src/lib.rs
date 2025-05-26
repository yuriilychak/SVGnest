use std::arch::wasm32::*;
use wasm_bindgen::prelude::*;

pub mod constants;
pub mod geometry;
pub mod nesting;
pub mod utils;

use crate::geometry::point::Point;
use crate::geometry::point_pool::PointPool;
use crate::nesting::pair_flow::{point_distance, segment_distance};
use utils::almost_equal::AlmostEqual;
use utils::bit_ops::*;
use utils::math::*;
use utils::mid_value::MidValue;

use web_sys::console;

pub fn debug_log(msg: &str) {
    console::log_1(&msg.into());
}

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
pub fn point_distance_f64(input: &[f64]) -> f64 {
    assert!(
        input.len() == 9,
        "Input must have exactly 9 elements: 4 points (x, y) + bool"
    );

    // Окремі буфери для кожної точки
    let mut buf_p = [input[0], input[1]];
    let mut buf_s1 = [input[2], input[3]];
    let mut buf_s2 = [input[4], input[5]];
    let mut buf_normal = [input[6], input[7]];

    let p = Point::<f64>::new(buf_p.as_mut_ptr(), 0);
    let s1 = Point::<f64>::new(buf_s1.as_mut_ptr(), 0);
    let s2 = Point::<f64>::new(buf_s2.as_mut_ptr(), 0);
    let input_normal = Point::<f64>::new(buf_normal.as_mut_ptr(), 0);

    // 2 тимчасові точки в пулі (максимум 32, але нам достатньо 2)
    let mut pool = PointPool::<f64>::new();

    let infinite = input[8] != 0.0;

    // Передаємо поінтери (raw pointers) на точки
    point_distance(
        &mut pool,
        &p as *const Point<f64>,
        &s1 as *const Point<f64>,
        &s2 as *const Point<f64>,
        &input_normal as *const Point<f64>,
        infinite,
    )
}

#[wasm_bindgen]
pub fn segment_distance_f64(input: &[f64]) -> f64 {
    assert!(
        input.len() == 10,
        "Input must have exactly 10 elements: 5 points (x, y)"
    );

    // Кожна точка у власному локальному буфері
    let mut buf_a = [input[0], input[1]];
    let mut buf_b = [input[2], input[3]];
    let mut buf_e = [input[4], input[5]];
    let mut buf_f = [input[6], input[7]];
    let mut buf_direction = [input[8], input[9]];

    let a = Point::<f64>::new(buf_a.as_mut_ptr(), 0);
    let b = Point::<f64>::new(buf_b.as_mut_ptr(), 0);
    let e = Point::<f64>::new(buf_e.as_mut_ptr(), 0);
    let f = Point::<f64>::new(buf_f.as_mut_ptr(), 0);
    let direction = Point::<f64>::new(buf_direction.as_mut_ptr(), 0);

    let mut pool = PointPool::<f64>::new();

    segment_distance(
        &mut pool,
        &a as *const Point<f64>,
        &b as *const Point<f64>,
        &e as *const Point<f64>,
        &f as *const Point<f64>,
        &direction as *const Point<f64>,
    )
}
