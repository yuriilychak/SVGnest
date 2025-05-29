use crate::utils::{
    almost_equal::AlmostEqual,
    interpolate::Interpolate,
    mid_value::MidValue,
    round::{ClipperRound, Round},
};
use crate::constants::{TOL_F32, TOL_F64};
use num_traits::{FromPrimitive, Num, ToPrimitive};
use std::ops::{Add, Div, Mul, Neg, Sub};

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
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Div<Output = Self>
    + Neg<Output = Self>
{
    fn min_num(self, other: Self) -> Self;
    fn max_num(self, other: Self) -> Self;
    fn tol() -> Self;
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
    fn tol() -> Self { TOL_F64 }
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
    fn tol() -> Self { TOL_F32 }
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
    fn tol() -> Self { 0 }
}
