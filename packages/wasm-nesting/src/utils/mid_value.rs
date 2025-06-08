pub trait MidValue<Rhs = Self> {
    fn mid_value(self, left: Rhs, right: Rhs) -> Self;
}

impl MidValue for f64 {
    fn mid_value(self, left: f64, right: f64) -> f64 {
        (2.0 * self - left - right).abs() - (left - right).abs()
    }
}

impl MidValue for f32 {
    fn mid_value(self, left: f32, right: f32) -> f32 {
        (2.0 * self - left - right).abs() - (left - right).abs()
    }
}

impl MidValue for i32 {
    fn mid_value(self, left: i32, right: i32) -> i32 {
        (2 * self - left - right).abs() - (left - right).abs()
    }
}
