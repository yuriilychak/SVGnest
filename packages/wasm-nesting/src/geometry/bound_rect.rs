use crate::geometry::point::Point;
use crate::utils::number::Number;

pub struct BoundRect<T: Number> {
    position: Point<T>,
    size: Point<T>,
}

impl<T: Number> BoundRect<T> {
    pub fn new(x: T, y: T, width: T, height: T) -> Self {
        let position = Point::new(Some(x), Some(y));
        let size = Point::new(Some(width), Some(height));

        Self { position, size }
    }

    pub unsafe fn update(&mut self, position: *const Point<T>, size: *const Point<T>) {
        self.position.update(position);
        self.size.update(size);
    }

    pub fn position(&self) -> *const Point<T> {
        &self.position as *const Point<T>
    }

    pub fn size(&self) -> *const Point<T> {
        &self.size as *const Point<T>
    }

    pub unsafe fn x(&self) -> T {
        self.position.x
    }

    pub unsafe fn y(&self) -> T {
        self.position.y
    }

    pub unsafe fn width(&self) -> T {
        self.size.x
    }

    pub unsafe fn height(&self) -> T {
        self.size.y
    }

    // Якщо треба clone (глибоке копіювання)
    pub unsafe fn clone(&self) -> Self {
        Self::new(self.x(), self.y(), self.width(), self.height())
    }
}
