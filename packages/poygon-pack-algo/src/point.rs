pub(crate) const TOLERANCE: f64 = 1e-9;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Point {
    pub(crate) x: f64,
    pub(crate) y: f64,
}

impl Point {
    pub(crate) fn add(self, other: Self) -> Self {
        Self {
            x: self.x + other.x,
            y: self.y + other.y,
        }
    }
    pub(crate) fn sub(self, other: Self) -> Self {
        Self {
            x: self.x - other.x,
            y: self.y - other.y,
        }
    }
    pub(crate) fn scale(self, value: f64) -> Self {
        Self {
            x: self.x * value,
            y: self.y * value,
        }
    }
    pub(crate) fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y
    }
    pub(crate) fn cross(self, other: Self) -> f64 {
        self.x * other.y - self.y * other.x
    }
    pub(crate) fn length2(self) -> f64 {
        self.dot(self)
    }
    pub(crate) fn length(self) -> f64 {
        self.length2().sqrt()
    }
    pub(crate) fn normalize(self) -> Self {
        let length = self.length();
        if almost_equal(length, 1.0, TOLERANCE) {
            self
        } else {
            self.scale(1.0 / length)
        }
    }
    pub(crate) fn normal(self) -> Self {
        Self {
            x: self.y,
            y: -self.x,
        }
    }
    pub(crate) fn rotate(self, degrees: f64) -> Self {
        let radians = degrees.to_radians();
        Self {
            x: self.x * radians.cos() - self.y * radians.sin(),
            y: self.x * radians.sin() + self.y * radians.cos(),
        }
    }
}

pub(crate) fn almost_equal(a: f64, b: f64, tolerance: f64) -> bool {
    (a - b).abs() < tolerance
}
