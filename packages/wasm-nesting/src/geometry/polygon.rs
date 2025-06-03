use crate::geometry::bound_rect::BoundRect;
use crate::geometry::point::Point;
use crate::utils::math::cycle_index;
use crate::utils::number::Number;

pub struct Polygon<T: Number> {
    buffer: Option<Box<[T]>>,
    offset: usize,
    point_count: usize,
    closed: bool,
    closed_dirty: bool,
    rectangle: bool,
    bounds: BoundRect<T>,
    cursor_buf: [T; 2],
    cursor: Point<T>,
}

impl<T: Number> Polygon<T> {
    pub fn new() -> Self {
        // 1) Спочатку створюємо cursor_buf як поле структури:
        let cursor_buf = [T::zero(), T::zero()];

        // 2) Створюємо самої структуру Polygon з тимчасовим cursor (null-pointer):
        let mut poly = Polygon {
            buffer: None,
            offset: 0,
            point_count: 0,
            closed: false,
            closed_dirty: false,
            rectangle: false,
            bounds: BoundRect::new(T::zero(), T::zero(), T::zero(), T::zero()),

            cursor_buf,
            cursor: Point::new(std::ptr::null_mut(), 0),
        };

        // 3) Як тільки cursor_buf стало полем Polygon,
        //    змінюємо cursor, щоб він справді «дивився» у cursor_buf:
        let ptr = poly.cursor_buf.as_mut_ptr();
        poly.cursor = Point::new(ptr, 0);

        poly
    }

    pub unsafe fn bind(&mut self, buffer: Box<[T]>, offset: usize, point_count: usize) {
        self.buffer = Some(buffer);
        self.offset = offset;
        self.point_count = point_count;
        self.closed_dirty = false;
        self.closed = false;
        self.rectangle = false;

        self.calculate_bounds();
    }

    pub fn clean(&mut self) {
        self.buffer = None;
        self.point_count = 0;
        self.offset = 0;
        self.closed_dirty = false;
        self.closed = false;
        self.rectangle = false;
    }

    pub unsafe fn at(&mut self, index: usize) -> *const Point<T> {
        if let Some(ref buf) = self.buffer {
            let point_index = cycle_index(index, self.point_count, 0);
            let idx = self.offset + (point_index << 1);

            self.cursor.set(buf[idx], buf[idx + 1])
        } else {
            self.cursor.set(T::zero(), T::zero())
        }
    }

    pub unsafe fn first(&mut self) -> *const Point<T> {
        self.at(0)
    }

    pub unsafe fn last(&mut self) -> *const Point<T> {
        let idx = cycle_index(self.length(), self.point_count, -1);
        self.at(idx)
    }

    pub fn length(&self) -> usize {
        let offset = if self.closed_dirty { 1 } else { 0 };
        self.point_count + offset
    }

    pub fn is_broken(&self) -> bool {
        self.length() < 3
    }

    pub fn is_closed(&self) -> bool {
        self.closed || self.closed_dirty
    }

    pub fn is_rectangle(&self) -> bool {
        self.rectangle
    }

    pub unsafe fn area(&mut self) -> f64 {
        let point_count = self.point_count;
        let mut result = T::zero();

        for i in 0..point_count {
            let prev = self.at(cycle_index(i, point_count, -1));
            let curr = self.at(i);
            result = result + ((*prev).x() + (*curr).x()) * ((*prev).y() - (*curr).y());
        }

        result.to_f64().unwrap() / 2.0
    }

    pub unsafe fn abs_area(&mut self) -> f64 {
        self.area().abs()
    }

    pub unsafe fn position(&self) -> *const Point<T> {
        self.bounds.position()
    }

    pub unsafe fn size(&self) -> *const Point<T> {
        self.bounds.size()
    }

    pub unsafe fn export_bounds(&self) -> BoundRect<T> {
        self.bounds.clone()
    }

    unsafe fn calculate_bounds(&mut self) {
        if self.is_broken() {
            return;
        }

        let zero = T::zero();
        let tol = T::tol();

        let mut min_buf = [zero, zero];
        let mut max_buf = [zero, zero];

        let min_point = Point::new(min_buf.as_mut_ptr(), 0);
        let max_point = Point::new(max_buf.as_mut_ptr(), 0);

        min_point.update(self.first());
        max_point.update(self.last());

        self.closed = min_point.almost_equal(&max_point as *const Point<T>, tol);

        for i in 0..self.point_count {
            let pt = self.at(i);
            min_point.min(pt);
            max_point.max(pt);
        }

        self.rectangle = true;

        for i in 0..self.point_count {
            let pt = self.at(i);
            if !(((*pt).almost_equal_x(&min_point as *const Point<T>, tol)
                || (*pt).almost_equal_x(&max_point as *const Point<T>, tol))
                && ((*pt).almost_equal_y(&min_point as *const Point<T>, tol)
                    || (*pt).almost_equal_y(&max_point as *const Point<T>, tol)))
            {
                self.rectangle = false;
                break;
            }
        }

        // max_point = max - min
        max_point.sub(&min_point);
        self.bounds.update(&min_point, &max_point);
    }

    pub fn close(&mut self) {
        if self.is_closed() {
            return;
        }

        self.closed_dirty = true;
    }

    pub fn reverse(&mut self) {
        if self.buffer.is_none() {
            return;
        }

        let buf = self.buffer.as_mut().unwrap();
        let half_point_count = self.point_count >> 1;
        let last_index = self.point_count - 1;

        for i in 0..half_point_count {
            let j = last_index - i;
            let i2 = self.offset + (i << 1);
            let j2 = self.offset + (j << 1);
            let i2p1 = i2 + 1;
            let j2p1 = j2 + 1;

            // Swap x
            buf[i2] = buf[i2] + buf[j2];
            buf[j2] = buf[i2] - buf[j2];
            buf[i2] = buf[i2] - buf[j2];
            // Swap y
            buf[i2p1] = buf[i2p1] + buf[j2p1];
            buf[j2p1] = buf[i2p1] - buf[j2p1];
            buf[i2p1] = buf[i2p1] - buf[j2p1];
        }
    }

    pub unsafe fn normalize(&mut self) -> Option<Box<[T]>> {
        if self.buffer.is_none() {
            return None;
        }

        let zero = T::zero();
        let mut first_buf = [zero, zero];
        let mut last_buf = [zero, zero];
        let first = Point::new(first_buf.as_mut_ptr(), 0);
        let last = Point::new(last_buf.as_mut_ptr(), 0);
        let mut point_count = self.point_count;

        first.update(self.first());
        last.update(self.last());

        // Видаляємо дублікати кінцевих точок
        while first.almost_equal(&last, T::tol()) && point_count > 1 {
            point_count -= 1;
            last.update(self.at(point_count - 1));
        }

        let buf = self.buffer.as_mut().unwrap();

        // Якщо були дублікати - скорочуємо буфер і point_count
        if self.point_count != point_count {
            self.point_count = point_count;
            let start = self.offset;
            let end = self.offset + (point_count << 1);
            let slice = &buf[start..end];
            let boxed = slice.to_vec().into_boxed_slice();
            self.buffer = Some(boxed);
        }

        // Якщо площа додатна — reverse
        if self.area() > 0.0 {
            self.reverse();
        }

        // Повертаємо оновлений буфер (або None, якщо полігон пустий)
        self.buffer.as_ref().map(|b| b.clone())
    }
}
