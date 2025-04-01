use wasm_bindgen::prelude::*;
use std::arch::wasm32::*;

fn wrap(index: usize, offset: usize, len: usize) -> usize {
    return (index + offset) % len;
}

#[wasm_bindgen]
pub fn polygon_area(points: &[f32]) -> f32 {
    let len = points.len();

    if len < 6 || len & 1 != 0 {
        return 0.0;
    }

    let mut area = 0.0;

    for i in (0..len).step_by(2) {
        area += 
            points[wrap(i, 1, len)] * points[wrap(i, 2, len)] - points[wrap(i, 0, len)] * points[wrap(i, 3, len)];
    }

    return area * 0.5;
}

#[wasm_bindgen]
pub fn polygon_area_simd(points: &[f32]) -> f32 {
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

    return 0.5 * (
        f32x4_extract_lane::<0>(acc) +
        f32x4_extract_lane::<1>(acc) +
        f32x4_extract_lane::<2>(acc) +
        f32x4_extract_lane::<3>(acc) +
        ((n_points & 1) as f32) *
        (points[len - 1] * points[0] - points[len - 2] * points[1])
    );
}
