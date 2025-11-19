use crate::constants::{TOL_F32, TOL_F64};
use crate::utils::{
    almost_equal::AlmostEqual,
    interpolate::Interpolate,
    mid_value::MidValue,
    round::{ClipperRound, Round},
};
use num_traits::{FromPrimitive, Num, Signed, ToPrimitive};
#[cfg(target_arch = "wasm32")]
use std::arch::wasm32::*;
use std::ops::{Add, Div, Mul, Neg, Sub};

fn wrap(index: usize, offset: usize, len: usize) -> usize {
    return (index + offset) % len;
}

pub trait Number:
    Num
    + Copy
    + PartialOrd
    + FromPrimitive
    + ToPrimitive
    + AlmostEqual
    + MidValue
    + ClipperRound
    + Round
    + Interpolate
    + Signed
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Div<Output = Self>
    + Neg<Output = Self>
{
    fn min_num(self, other: Self) -> Self;
    fn max_num(self, other: Self) -> Self;
    fn tol() -> Self;
    fn polygon_area(points: &[Self]) -> f64;
    fn reverse_polygon(data: &mut [Self], offset: usize, point_count: usize) {
        let half = point_count >> 1;
        let last = point_count - 1;
        for i in 0..half {
            let j = last - i;
            let i2 = offset + (i << 1);
            let j2 = offset + (j << 1);
            data.swap(i2, j2);
            data.swap(i2 + 1, j2 + 1);
        }
    }
}

impl Number for f64 {
    #[inline(always)]
    fn min_num(self, other: Self) -> Self {
        self.min(other)
    }
    #[inline(always)]
    fn max_num(self, other: Self) -> Self {
        self.max(other)
    }
    #[inline(always)]
    fn tol() -> Self {
        TOL_F64
    }

    #[cfg(target_arch = "wasm32")]
    #[inline(always)]
    fn polygon_area(points: &[Self]) -> f64 {
        let len = points.len();

        if len < 6 || len & 1 != 0 {
            return 0.0;
        }

        let n_points = len >> 1;
        let mut acc = f64x2_splat(0.0);
        let mut x0: Self;
        let mut y0: Self;
        let mut x1: Self;
        let mut y1: Self;
        let mut base: usize;
        let mut stack1: v128;
        let mut stack2: v128;

        for i in 0..n_points {
            base = i << 1;
            x0 = points[wrap(base, 0, len)];
            y0 = points[wrap(base, 1, len)];
            x1 = points[wrap(base, 2, len)];
            y1 = points[wrap(base, 3, len)];

            stack1 = f64x2(y0, -x0);
            stack2 = f64x2(x1, y1);
            acc = f64x2_add(acc, f64x2_mul(stack1, stack2));
        }

        return 0.5 * (f64x2_extract_lane::<0>(acc) + f64x2_extract_lane::<1>(acc));
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[inline(always)]
    fn polygon_area(points: &[Self]) -> f64 {
        let len = points.len();

        if len < 6 || len & 1 != 0 {
            return 0.0;
        }

        let n_points = len >> 1;
        let mut acc = 0.0;

        for i in 0..n_points {
            let base = i << 1;
            let x0 = points[wrap(base, 0, len)];
            let y0 = points[wrap(base, 1, len)];
            let x1 = points[wrap(base, 2, len)];
            let y1 = points[wrap(base, 3, len)];

            acc += y0 * x1 - x0 * y1;
        }

        return 0.5 * acc;
    }
}

impl Number for f32 {
    #[inline(always)]
    fn min_num(self, other: Self) -> Self {
        self.min(other)
    }
    #[inline(always)]
    fn max_num(self, other: Self) -> Self {
        self.max(other)
    }
    #[inline(always)]
    fn tol() -> Self {
        TOL_F32
    }

    #[cfg(target_arch = "wasm32")]
    #[inline(always)]
    fn polygon_area(points: &[Self]) -> f64 {
        let len = points.len();

        if len < 6 || len & 1 != 0 {
            return 0.0;
        }

        let n_points = len >> 1;
        let simd_pairs = n_points >> 1;
        let mut acc = f32x4_splat(0.0);
        let mut x0: Self;
        let mut y0: Self;
        let mut x1: Self;
        let mut y1: Self;
        let mut x2: Self;
        let mut y2: Self;
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
                + ((n_points & 1) as Self)
                    * (points[len - 1] * points[0] - points[len - 2] * points[1]))
                .to_f64()
                .unwrap();
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[inline(always)]
    fn polygon_area(points: &[Self]) -> f64 {
        let len = points.len();

        if len < 6 || len & 1 != 0 {
            return 0.0;
        }

        let n_points = len >> 1;
        let mut acc = 0.0f32;

        for i in 0..n_points {
            let base = i << 1;
            let x0 = points[wrap(base, 0, len)];
            let y0 = points[wrap(base, 1, len)];
            let x1 = points[wrap(base, 2, len)];
            let y1 = points[wrap(base, 3, len)];

            acc += y0 * x1 - x0 * y1;
        }

        return (0.5 * acc).to_f64().unwrap();
    }
}

impl Number for i32 {
    #[inline(always)]
    fn min_num(self, other: Self) -> Self {
        self.min(other)
    }
    #[inline(always)]
    fn max_num(self, other: Self) -> Self {
        self.max(other)
    }
    #[inline(always)]
    fn tol() -> Self {
        0
    }

    #[cfg(target_arch = "wasm32")]
    #[inline(always)]
    fn polygon_area(points: &[Self]) -> f64 {
        let len = points.len();

        if len < 6 || len & 1 != 0 {
            return 0.0;
        }

        let n_points = len >> 1;
        let mut acc = i64x2_splat(0);
        let mut x0: i64;
        let mut y0: i64;
        let mut x1: i64;
        let mut y1: i64;
        let mut base: usize;
        let mut stack1: v128;
        let mut stack2: v128;

        for i in 0..n_points {
            base = i << 1;
            x0 = points[wrap(base, 0, len)].to_i64().unwrap();
            y0 = points[wrap(base, 1, len)].to_i64().unwrap();
            x1 = points[wrap(base, 2, len)].to_i64().unwrap();
            y1 = points[wrap(base, 3, len)].to_i64().unwrap();

            stack1 = i64x2(y0, -x0);
            stack2 = i64x2(x1, y1);
            acc = i64x2_add(acc, i64x2_mul(stack1, stack2));
        }

        return 0.5
            * (i64x2_extract_lane::<0>(acc) + i64x2_extract_lane::<1>(acc))
                .to_f64()
                .unwrap();
    }

    #[cfg(not(target_arch = "wasm32"))]
    #[inline(always)]
    fn polygon_area(points: &[Self]) -> f64 {
        let len = points.len();

        if len < 6 || len & 1 != 0 {
            return 0.0;
        }

        let n_points = len >> 1;
        let mut acc = 0i64;

        for i in 0..n_points {
            let base = i << 1;
            let x0 = points[wrap(base, 0, len)] as i64;
            let y0 = points[wrap(base, 1, len)] as i64;
            let x1 = points[wrap(base, 2, len)] as i64;
            let y1 = points[wrap(base, 3, len)] as i64;

            acc += y0 * x1 - x0 * y1;
        }

        return 0.5 * acc as f64;
    }
}
