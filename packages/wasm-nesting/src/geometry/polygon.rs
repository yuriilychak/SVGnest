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
    calculate_bounds_dirty: bool,
    rectangle: bool,
    bounds: BoundRect<T>,
    cursor: Point<T>,
}

impl<T: Number> Polygon<T> {
    pub fn new() -> Self {
        Self {
            buffer: None,
            offset: 0,
            point_count: 0,
            closed: false,
            closed_dirty: false,
            rectangle: false,
            calculate_bounds_dirty: true,
            bounds: BoundRect::new(T::zero(), T::zero(), T::zero(), T::zero()),
            cursor: Point::new(None, None),
        }
    }

    pub unsafe fn bind(&mut self, buffer: Box<[T]>, offset: usize, point_count: usize) {
        self.buffer = Some(buffer);
        self.offset = offset;
        self.point_count = point_count;
        self.closed_dirty = false;
        self.closed = false;
        self.rectangle = false;
        self.calculate_bounds_dirty = true;
    }

    pub fn clean(&mut self) {
        self.buffer = None;
        self.point_count = 0;
        self.offset = 0;
        self.closed_dirty = false;
        self.closed = false;
        self.rectangle = false;
        self.calculate_bounds_dirty = true;
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

    pub unsafe fn is_rectangle(&mut self) -> bool {
        self.calculate_bounds();
        self.rectangle
    }

    pub unsafe fn area(&mut self) -> f64 {
        return Number::polygon_area(self.buffer.as_ref().unwrap());
    }

    pub unsafe fn abs_area(&mut self) -> f64 {
        self.area().abs()
    }

    pub unsafe fn position(&mut self) -> *const Point<T> {
        self.calculate_bounds();
        self.bounds.position()
    }

    pub unsafe fn size(&mut self) -> *const Point<T> {
        self.calculate_bounds();
        self.bounds.size()
    }

    pub unsafe fn export_bounds(&mut self) -> BoundRect<T> {
        self.calculate_bounds();
        self.bounds.clone()
    }

    unsafe fn calculate_bounds(&mut self) {
        if self.is_broken() || !self.calculate_bounds_dirty {
            return;
        }

        self.calculate_bounds_dirty = false;

        if let Some(ref buf) = self.buffer {
            // Use Number::calculate_bounds to get [x, y, width, height]
            let bounds = T::calculate_bounds(buf, self.offset, self.point_count);

            let min_point = Point::new(Some(bounds[0]), Some(bounds[1]));
            let size_point = Point::new(Some(bounds[2]), Some(bounds[3]));

            // Check if polygon is closed
            let first = Point::from(self.first());
            let last = Point::from(self.last());
            self.closed = first.almost_equal(&last as *const Point<T>, None);

            // Check if polygon is a rectangle
            self.rectangle = true;
            let max_x = bounds[0] + bounds[2];
            let max_y = bounds[1] + bounds[3];

            for i in 0..self.point_count {
                let pt = self.at(i);
                let px = (*pt).x;
                let py = (*pt).y;

                if !((px.almost_equal(bounds[0], None) || px.almost_equal(max_x, None))
                    && (py.almost_equal(bounds[1], None) || py.almost_equal(max_y, None)))
                {
                    self.rectangle = false;
                    break;
                }
            }

            self.bounds.update(&min_point, &size_point);
        }
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

        Number::reverse_polygon(self.buffer.as_mut().unwrap(), self.offset, self.point_count);
    }

    pub unsafe fn normalize(&mut self) -> Option<Box<[T]>> {
        if self.buffer.is_none() {
            return None;
        }

        let first = Point::from(self.first());
        let mut last = Point::from(self.last());
        let mut point_count = self.point_count;

        while first.almost_equal(&last, None) && point_count > 1 {
            point_count -= 1;
            last.update(self.at(point_count - 1));
        }

        let buf = self.buffer.as_mut().unwrap();

        if self.point_count != point_count {
            self.point_count = point_count;
            let start = self.offset;
            let end = self.offset + (point_count << 1);
            let slice = &buf[start..end];
            let boxed = slice.to_vec().into_boxed_slice();
            self.buffer = Some(boxed);
        }

        if self.area() > 0.0 {
            self.reverse();
        }

        self.buffer.as_ref().map(|b| b.clone())
    }

    pub unsafe fn point_in(
        &mut self,
        point: *const Point<T>,
        offset: Option<*const Point<T>>,
    ) -> Option<bool> {
        if self.is_broken() {
            return None;
        }

        let inner_point = Point::<T>::from(point);
        let mut curr_point = Point::<T>::new(None, None);
        let mut prev_point = Point::<T>::new(None, None);

        let point_count = self.point_count as usize;

        let mut inside = false;
        for i in 0..point_count {
            curr_point.update(self.at(i));

            let prev_idx = cycle_index(i, point_count, -1);

            prev_point.update(self.at(prev_idx));

            if let Some(off) = offset {
                curr_point.add(off);
                prev_point.add(off);
            }

            // Якщо точка точно лежить на вершині або на сегменті — повертаємо None
            if curr_point.almost_equal(&inner_point, None)
                || inner_point.on_segment(&curr_point, &prev_point)
            {
                return None;
            }

            if curr_point.almost_equal(&prev_point, None) {
                continue;
            }

            let curr_y_gt = curr_point.y > inner_point.y;
            let prev_y_gt = prev_point.y > inner_point.y;

            if curr_y_gt != prev_y_gt {
                let inter_x = inner_point.interpolate_x(&prev_point, &curr_point);
                if inner_point.x < inter_x {
                    inside = !inside;
                }
            }
        }

        Some(inside)
    }
}
