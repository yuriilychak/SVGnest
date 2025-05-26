use std::ops::{Add, Sub, Mul, Div, Neg};
use num_traits::{Num, FromPrimitive, ToPrimitive};
use crate::utils::{
    almost_equal::AlmostEqual,
    mid_value::MidValue,
    round::{ClipperRound, Round},
    interpolate::Interpolate,
};

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
}
