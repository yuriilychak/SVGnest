use crate::constants::{TOL_F32, TOL_F64};

pub trait AlmostEqual<Rhs = Self> {
    fn almost_equal(self, other: Rhs, tolerance: Option<Rhs>) -> bool;
}

impl AlmostEqual for f64 {
    fn almost_equal(self, other: f64, tolerance: Option<f64>) -> bool {
        let tol = tolerance.unwrap_or(TOL_F64);
        (self - other).abs() < tol
    }
}

impl AlmostEqual for f32 {
    fn almost_equal(self, other: f32, tolerance: Option<f32>) -> bool {
        let tol = tolerance.unwrap_or(TOL_F32);
        (self - other).abs() < tol
    }
}

impl AlmostEqual for i32 {
    fn almost_equal(self, other: i32, _tolerance: Option<i32>) -> bool {
        self == other
    }
}