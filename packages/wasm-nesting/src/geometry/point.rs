use crate::utils::math::slopes_equal;
use crate::utils::number::Number;

const LOW_RANGE: f64 = 47453132.0;

const HIGH_RANGE: f64 = 4503599627370495.0;

#[derive(Debug, PartialEq)]
pub struct Point<T: Number> {
    pub x: T,
    pub y: T,
}

impl<T: Number> Point<T> {
    #[inline(always)]
    pub fn new(x: Option<T>, y: Option<T>) -> Self {
        Self {
            x: x.unwrap_or(T::zero()),
            y: y.unwrap_or(T::zero()),
        }
    }

    #[inline(always)]
    pub fn from(other: *const Self) -> Self {
        unsafe {
            Self {
                x: (*other).x,
                y: (*other).y,
            }
        }
    }

    #[inline(always)]
    pub unsafe fn from_mem_seg(&mut self, data: &[T], index: usize, offset: usize) -> *mut Self {
        let mem_index = offset + (index << 1);
        let x = data[mem_index];
        let y = data[mem_index + 1];

        self.set(x, y)
    }

    #[inline(always)]
    pub fn fill(&self, mem_seg: &mut [T], index: usize, offset: Option<usize>) {
        let mem_index = offset.unwrap_or(0) + (index << 1);
        mem_seg[mem_index] = self.x;
        mem_seg[mem_index + 1] = self.y;
    }

    #[inline(always)]
    pub unsafe fn set(&mut self, x: T, y: T) -> *mut Self {
        self.x = x;
        self.y = y;

        self as *const Self as *mut Self
    }

    #[inline(always)]
    pub unsafe fn update(&mut self, other: *const Self) -> *mut Self {
        self.set((*other).x, (*other).y)
    }

    #[inline(always)]
    pub unsafe fn add(&mut self, other: *const Self) -> *mut Self {
        self.set(self.x + (*other).x, self.y + (*other).y)
    }

    #[inline(always)]
    pub unsafe fn sub(&mut self, other: *const Self) -> *mut Self {
        self.set(self.x - (*other).x, self.y - (*other).y)
    }

    #[inline(always)]
    pub unsafe fn mul(&mut self, other: *const Self) -> *mut Self {
        self.set(self.x * (*other).x, self.y * (*other).y)
    }

    #[inline(always)]
    pub unsafe fn max(&mut self, other: *const Self) -> *mut Self {
        self.set(self.x.max_num((*other).x), self.y.max_num((*other).y))
    }

    #[inline(always)]
    pub unsafe fn min(&mut self, other: *const Self) -> *mut Self {
        self.set(self.x.min_num((*other).x), self.y.min_num((*other).y))
    }

    #[inline(always)]
    pub unsafe fn scale_up(&mut self, value: T) -> *mut Self {
        self.set(self.x * value, self.y * value)
    }

    #[inline(always)]
    pub unsafe fn scale_down(&mut self, value: T) -> *mut Self {
        self.set(self.x / value, self.y / value)
    }

    #[inline(always)]
    pub unsafe fn reverse(&mut self) -> *mut Self {
        self.set(-self.x, -self.y)
    }

    #[inline(always)]
    pub unsafe fn normal(&mut self) -> *mut Self {
        self.set(self.y, -self.x)
    }

    #[inline(always)]
    pub unsafe fn dot(&self, other: *const Self) -> T {
        self.x * (*other).x + self.y * (*other).y
    }

    #[inline(always)]
    pub unsafe fn cross(&self, other: *const Self) -> T {
        self.y * (*other).x - self.x * (*other).y
    }

    #[inline(always)]
    pub unsafe fn almost_equal_x(&self, other: *const Self, tolerance: Option<T>) -> bool {
        self.x
            .almost_equal((*other).x, Some(tolerance.unwrap_or(T::tol())))
    }

    #[inline(always)]
    pub unsafe fn almost_equal_y(&self, other: *const Self, tolerance: Option<T>) -> bool {
        self.y
            .almost_equal((*other).y, Some(tolerance.unwrap_or(T::tol())))
    }

    #[inline(always)]
    pub unsafe fn almost_equal(&self, other: *const Self, tolerance: Option<T>) -> bool {
        self.almost_equal_x(other, Some(tolerance.unwrap_or(T::tol())))
            && self.almost_equal_y(other, Some(tolerance.unwrap_or(T::tol())))
    }

    #[inline(always)]
    pub unsafe fn len2(&self, other: *const Self) -> T {
        let dx = self.x - (*other).x;
        let dy = self.y - (*other).y;
        dx * dx + dy * dy
    }

    #[inline(always)]
    pub unsafe fn len(&self, other: *const Self) -> f64 {
        self.len2(other).to_f64().unwrap().sqrt()
    }

    #[inline(always)]
    pub unsafe fn length2(&self) -> T {
        self.x * self.x + self.y * self.y
    }

    #[inline(always)]
    pub unsafe fn length(&self) -> f64 {
        self.length2().to_f64().unwrap().sqrt()
    }

    #[inline(always)]
    pub unsafe fn is_empty(&self) -> bool {
        self.x == T::zero() && self.y == T::zero()
    }

    #[inline(always)]
    pub unsafe fn get_between(&self, point1: *mut Point<T>, point2: *mut Point<T>) -> bool {
        if (*point1).almost_equal(point2, None)
            || (*point1).almost_equal(self, None)
            || self.almost_equal(point2, None)
        {
            return false;
        }

        if (*point1).x != (*point2).x {
            (self.x > (*point1).x) == (self.x < (*point2).x)
        } else {
            (self.y > (*point1).y) == (self.y < (*point2).y)
        }
    }

    #[inline(always)]
    pub unsafe fn normalize(&mut self) -> *mut Self {
        let len = self.length();
        if !self.is_empty() && !T::from_f64(len).unwrap().almost_equal(T::one(), None) {
            self.scale_down(T::from_f64(len).unwrap());
        }
        self as *const Self as *mut Self
    }

    #[inline(always)]
    pub unsafe fn interpolate_x(&self, begin: *const Self, end: *const Self) -> T {
        T::interpolate(self.y, (*begin).y, (*end).y, (*begin).x, (*end).x)
    }

    #[inline(always)]
    pub unsafe fn interpolate_y(&self, begin: *const Self, end: *const Self) -> T {
        T::interpolate(self.x, (*begin).x, (*end).x, (*begin).y, (*end).y)
    }

    #[inline(always)]
    pub unsafe fn round(&mut self) -> *mut Self {
        self.set(self.x.rounded(), self.y.rounded())
    }

    #[inline(always)]
    pub unsafe fn clipper_round(&mut self) -> *mut Self {
        self.set(self.x.clipper_rounded(), self.y.clipper_rounded())
    }

    #[inline(always)]
    pub fn range_test(&self, use_full_range: bool) -> bool {
        if use_full_range {
            if self.x.to_f64().unwrap().abs() > HIGH_RANGE
                || self.y.to_f64().unwrap().abs() > HIGH_RANGE
            {
                //console.warn('Coordinate outside allowed range in rangeTest().');
            }
        } else if self.x.to_f64().unwrap().abs() > LOW_RANGE
            || self.y.to_f64().unwrap().abs() > LOW_RANGE
        {
            return self.range_test(true);
        }

        return use_full_range;
    }

    #[inline(always)]
    pub unsafe fn on_segment(&self, a: *const Self, b: *const Self) -> bool {
        let mid_x = T::mid_value(self.x, (*a).x, (*b).x);
        let mid_y = T::mid_value(self.y, (*a).y, (*b).y);

        if (*a).almost_equal_x(b, None) && (*a).almost_equal_x(self, None) {
            return !self.almost_equal_y(b, None)
                && !self.almost_equal_y(a, None)
                && mid_y < T::zero();
        }

        if (*a).almost_equal_y(b, None) && (*a).almost_equal_y(self, None) {
            return !self.almost_equal_x(b, None)
                && !self.almost_equal_x(a, None)
                && mid_x < T::zero();
        }

        if mid_x > T::zero()
            || mid_y > T::zero()
            || self.almost_equal(a, None)
            || self.almost_equal(b, None)
        {
            return false;
        }

        let mut sub_a = Point::<T>::from(self);
        let mut sub_ab = Point::<T>::from(b);

        sub_a.sub(a);
        sub_ab.sub(a);

        if !(sub_a
            .cross(&sub_ab as *const Point<T>)
            .almost_equal(T::zero(), None))
        {
            return false;
        }

        let dot = sub_a.dot(&sub_ab as *const Point<T>);

        if dot < T::tol() {
            return false;
        }

        let len2 = (*a).len2(b);

        dot < len2 && !dot.almost_equal(len2, None)
    }

    #[inline(always)]
    pub unsafe fn slopes_equal(pt1: &Self, pt2: &Self, pt3: &Self, use_full_range: bool) -> bool {
        slopes_equal(
            (pt1.y - pt2.y).to_f64().unwrap(),
            (pt2.x - pt3.x).to_f64().unwrap(),
            (pt1.x - pt2.x).to_f64().unwrap(),
            (pt2.y - pt3.y).to_f64().unwrap(),
            use_full_range,
        )
    }
}
