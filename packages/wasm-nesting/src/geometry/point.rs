use crate::utils::number::Number;

#[derive(Debug)]
pub struct Point<T: Number> {
    ptr: *mut T,
    offset: usize,
}

impl<T: Number> Point<T> {
    #[inline(always)]
    pub fn new(ptr: *mut T, offset: usize) -> Self {
        Self { ptr, offset }
    }

    #[inline(always)]
    pub unsafe fn x(&self) -> T {
        *self.ptr.add(self.offset)
    }

    #[inline(always)]
    pub unsafe fn y(&self) -> T {
        *self.ptr.add(self.offset + 1)
    }

    #[inline(always)]
    pub unsafe fn set(&self, x: T, y: T) -> *mut Self {
        *self.ptr.add(self.offset) = x;
        *self.ptr.add(self.offset + 1) = y;
        self as *const Self as *mut Self
    }

    #[inline(always)]
    pub unsafe fn update(&self, other: *const Self) -> *mut Self {
        self.set((*other).x(), (*other).y())
    }

    #[inline(always)]
    pub unsafe fn add(&self, other: *const Self) -> *mut Self {
        self.set(self.x() + (*other).x(), self.y() + (*other).y())
    }

    #[inline(always)]
    pub unsafe fn sub(&self, other: *const Self) -> *mut Self {
        self.set(self.x() - (*other).x(), self.y() - (*other).y())
    }

    #[inline(always)]
    pub unsafe fn mul(&self, other: *const Self) -> *mut Self {
        self.set(self.x() * (*other).x(), self.y() * (*other).y())
    }

    #[inline(always)]
    pub unsafe fn max(&self, other: *const Self) -> *mut Self {
        self.set(self.x().max_num((*other).x()), self.y().max_num((*other).y()))
    }

    #[inline(always)]
    pub unsafe fn min(&self, other: *const Self) -> *mut Self {
        self.set(self.x().min_num((*other).x()), self.y().min_num((*other).y()))
    }

    #[inline(always)]
    pub unsafe fn scale_up(&self, value: T) -> *mut Self {
        self.set(self.x() * value, self.y() * value)
    }

    #[inline(always)]
    pub unsafe fn scale_down(&self, value: T) -> *mut Self {
        self.set(self.x() / value, self.y() / value)
    }

    #[inline(always)]
    pub unsafe fn reverse(&self) -> *mut Self {
        self.set(-self.x(), -self.y())
    }

    #[inline(always)]
    pub unsafe fn normal(&self) -> *mut Self {
        self.set(self.y(), -self.x())
    }

    #[inline(always)]
    pub unsafe fn dot(&self, other: *const Self) -> T {
        self.x() * (*other).x() + self.y() * (*other).y()
    }

    #[inline(always)]
    pub unsafe fn cross(&self, other: *const Self) -> T {
        self.y() * (*other).x() - self.x() * (*other).y()
    }

    #[inline(always)]
    pub unsafe fn almost_equal_x(&self, other: *const Self, tolerance: T) -> bool {
        self.x().almost_equal((*other).x(), Some(tolerance))
    }

    #[inline(always)]
    pub unsafe fn almost_equal_y(&self, other: *const Self, tolerance: T) -> bool {
        self.y().almost_equal((*other).y(), Some(tolerance))
    }

    #[inline(always)]
    pub unsafe fn almost_equal(&self, other: *const Self, tolerance: T) -> bool {
        self.almost_equal_x(other, tolerance)
            && self.almost_equal_y(other, tolerance)
    }

    #[inline(always)]
    pub unsafe fn len2(&self, other: *const Self) -> T {
        let dx = self.x() - (*other).x();
        let dy = self.y() - (*other).y();
        dx * dx + dy * dy
    }

    #[inline(always)]
    pub unsafe fn len(&self, other: *const Self) -> f64 {
        self.len2(other).to_f64().unwrap().sqrt()
    }

    #[inline(always)]
    pub unsafe fn length2(&self) -> T {
        self.x() * self.x() + self.y() * self.y()
    }

    #[inline(always)]
    pub unsafe fn length(&self) -> f64 {
        self.length2().to_f64().unwrap().sqrt()
    }

    #[inline(always)]
    pub unsafe fn is_empty(&self) -> bool {
        self.x() == T::zero() && self.y() == T::zero()
    }

    #[inline(always)]
    pub unsafe fn normalize(&self) -> *mut Self {
        let len = self.length();
        if !self.is_empty() && !T::from_f64(len).unwrap().almost_equal(T::one(), None) {
            self.scale_down(T::from_f64(len).unwrap());
        }
        self as *const Self as *mut Self
    }

    #[inline(always)]
    pub unsafe fn interpolate_x(&self, begin: *const Self, end: *const Self) -> T {
        T::interpolate(self.y(), (*begin).y(), (*end).y(), (*begin).x(), (*end).x())
    }

    #[inline(always)]
    pub unsafe fn interpolate_y(&self, begin: *const Self, end: *const Self) -> T {
        T::interpolate(self.x(), (*begin).x(), (*end).x(), (*begin).y(), (*end).y())
    }

    #[inline(always)]
    pub unsafe fn round(&self) -> *mut Self {
        self.set(self.x().rounded(), self.y().rounded())
    }

    #[inline(always)]
    pub unsafe fn clipper_round(&self) -> *mut Self {
        self.set(self.x().clipper_rounded(), self.y().clipper_rounded())
    }
}
