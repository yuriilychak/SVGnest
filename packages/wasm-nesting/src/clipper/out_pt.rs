use crate::clipper::enums::Direction;
use crate::geometry::point::Point;
use std::ptr;

pub const HORIZONTAL: f64 = -9007199254740992.00;

pub struct OutPt {
    pub index: i32,
    pub point: Point<i32>,
    pub next: *mut OutPt,
    pub prev: *mut OutPt,
}

impl OutPt {
    pub fn new(index: i32, pt_opt: Option<&Point<i32>>) -> Box<Self> {
        let point = if let Some(orig) = pt_opt {
            Point::<i32>::new(Some(orig.x), Some(orig.y))
        } else {
            Point::<i32>::new(None, None)
        };

        Box::new(OutPt {
            index,
            point,
            next: ptr::null_mut(),
            prev: ptr::null_mut(),
        })
    }

    pub unsafe fn exclude(&mut self) -> *mut OutPt {
        let result = self.prev;

        if !result.is_null() {
            (*result).next = self.next;
        }

        if !self.next.is_null() {
            (*self.next).prev = result;
        }

        if !result.is_null() {
            (*result).index = 0;
        }

        result
    }

    pub unsafe fn dispose(&mut self) {
        if !self.prev.is_null() {
            (*self.prev).next = ptr::null_mut();
        }

        let mut cur = self as *mut Self;

        while !cur.is_null() {
            cur = (*cur).next;
        }
    }

    pub unsafe fn duplicate(&mut self, is_insert_after: bool) -> *mut OutPt {
        let new_node = OutPt::new(self.index, Some(&self.point));
        let raw_ptr: *mut OutPt = Box::into_raw(new_node);

        if is_insert_after {
            (*raw_ptr).next = self.next;
            (*raw_ptr).prev = self;

            if !self.next.is_null() {
                (*self.next).prev = raw_ptr;
            }

            self.next = raw_ptr;
        } else {
            (*raw_ptr).prev = self.prev;
            (*raw_ptr).next = self;

            if !self.prev.is_null() {
                (*self.prev).next = raw_ptr;
            }

            self.prev = raw_ptr;
        }

        raw_ptr
    }

    pub unsafe fn point_count(&mut self) -> usize {
        let start = self as *mut OutPt;
        let mut cnt = 0;
        let mut cur = start;

        loop {
            cnt += 1;
            cur = (*cur).next;

            if cur == start {
                break;
            }
        }

        cnt
    }

    unsafe fn get_join_b(&mut self, op1: *mut OutPt, op2: *mut OutPt, is_next: bool) -> *mut OutPt {
        let mut result = self as *mut OutPt;

        while (*result).get_neighboar(is_next) != op1
            && (*(*result).get_neighboar(is_next)).point.y == (*result).point.y
            && (*result).get_neighboar(is_next) != op2
        {
            result = (*result).get_neighboar(is_next);
        }

        result
    }

    pub unsafe fn check_join_b(
        &mut self,
        op1: *mut OutPt,
        op1b: *mut OutPt,
    ) -> (*mut OutPt, *mut OutPt, bool) {
        let op = self as *mut OutPt;
        let op2 = self.get_join_b(op, op1b, false);
        let op2b = self.get_join_b(op2, op1, false);
        let is_joined = (*op2b).next == op2 || (*op2b).next == op1;

        (op2, op2b, is_joined)
    }

    pub unsafe fn get_unique_pt(&mut self, is_next: bool) -> *mut OutPt {
        let mut result = self.get_neighboar(is_next);

        while result != self && (*result).point.almost_equal(&self.point, None) {
            result = (*result).get_neighboar(is_next);
        }

        result
    }

    pub unsafe fn reverse(&mut self) {
        let start = self as *mut OutPt;
        let mut cur = start;

        loop {
            let next = (*cur).next;
            let tmp = (*cur).next;

            (*cur).next = (*cur).prev;
            (*cur).prev = tmp;

            cur = next;

            if cur == start {
                break;
            }
        }
    }

    pub unsafe fn point_in(&mut self, pt: *const Point<i32>) -> i32 {
        let mut result: i32 = 0;
        let start = self as *mut OutPt;
        let mut cur = start;

        if cur.is_null() {
            return 0;
        }

        loop {
            let node = cur;
            let p0 = &((*node).point);
            let next_ptr = (*node).next;

            if next_ptr.is_null() {
                return 0;
            }

            let p1 = &((*next_ptr).point);

            let poly0x = p0.x;
            let poly0y = p0.y;
            let poly1x = p1.x;
            let poly1y = p1.y;
            let px = (*pt).x;
            let py = (*pt).y;

            if poly1y == py && (poly1x == px || (poly0y == py && ((poly1x > px) == (poly0x < px))))
            {
                return -1;
            }

            if (poly0y < py) != (poly1y < py) {
                if poly0x >= px {
                    if poly1x > px {
                        result = 1 - result;
                    } else {
                        let d = (poly0x - px) as i64 * (poly1y - py) as i64
                            - (poly1x - px) as i64 * (poly0y - py) as i64;

                        if d == 0 {
                            return -1;
                        }

                        if (d > 0) == (poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                } else if poly1x > px {
                    let d = (poly0x - px) as i64 * (poly1y - py) as i64
                        - (poly1x - px) as i64 * (poly0y - py) as i64;

                    if d == 0 {
                        return -1;
                    }

                    if (d > 0) == (poly1y > poly0y) {
                        result = 1 - result;
                    }
                }
            }

            cur = (*node).next;

            if cur == start {
                break;
            }
        }

        result
    }

    pub unsafe fn get_bottom_pt(&mut self) -> *mut OutPt {
        let mut best = self as *mut OutPt;
        let mut cur = (*best).next;
        let mut dups: *mut OutPt = ptr::null_mut();

        while cur != best {
            let by = (*best).point.y;
            let cy = (*cur).point.y;

            if cy > by {
                best = cur;
                dups = ptr::null_mut();
            } else if cy == by {
                let bx = (*best).point.x;
                let cx = (*cur).point.x;

                if cx < bx {
                    best = cur;
                    dups = ptr::null_mut();
                } else if cx == bx && (*cur).next != best && (*cur).prev != best {
                    dups = cur;
                }
            }
            cur = (*cur).next;
        }

        if !dups.is_null() {
            let mut scan = dups;

            while scan != best {
                if !OutPt::first_is_bottom_pt(scan, best) {
                    best = scan;
                }

                scan = (*scan).next;

                while !(*scan).point.almost_equal(&(*best).point, None) {
                    scan = (*scan).next;
                }
            }
        }

        best
    }

    unsafe fn get_neighboar(&self, is_next: bool) -> *mut OutPt {
        if is_next {
            self.next
        } else {
            self.prev
        }
    }

    unsafe fn get_distance(&mut self, is_next: bool) -> f64 {
        let start = self as *mut OutPt;
        let mut p = self.get_neighboar(is_next);

        if p.is_null() {
            return f64::NAN;
        }

        while (*p).point.almost_equal(&self.point, None) && p != start {
            p = (*p).get_neighboar(is_next);

            if p.is_null() {
                return f64::NAN;
            }
        }

        let offset_y = ((*p).point.y - self.point.y) as f64;
        let offset_x = ((*p).point.x - self.point.x) as f64;
        let result = if offset_y == 0.0 {
            HORIZONTAL
        } else {
            offset_x / offset_y
        };

        return result.abs();
    }

    pub unsafe fn get_direction(&self, out_pt: *const OutPt) -> Direction {
        if self.point.x > (*out_pt).point.x {
            Direction::Left
        } else {
            Direction::Right
        }
    }

    pub unsafe fn get_discarded(&self, is_right: bool, pt: *const Point<i32>) -> bool {
        let next = self.next;

        if next.is_null() {
            return false;
        }

        if is_right {
            (*next).point.x <= (*pt).x
                && (*next).point.x >= self.point.x
                && (*next).point.y == (*pt).y
        } else {
            (*next).point.x >= (*pt).x
                && (*next).point.x <= self.point.x
                && (*next).point.y == (*pt).y
        }
    }

    pub unsafe fn join_horz_inner(
        &mut self,
        out_pt: *mut OutPt,
        point: *const Point<i32>,
        is_discard_left: bool,
    ) -> (*mut OutPt, *mut OutPt, bool) {
        let mut op = self as *mut OutPt;
        let mut op_b = out_pt;

        let direction = (*op).get_direction(op_b);
        let is_right = direction == Direction::Right;
        let is_right_order = is_discard_left != is_right;

        while (*op).get_discarded(is_right, point) {
            op = (*op).next;
        }

        if !is_right_order && (*op).point.x != (*point).x {
            op = (*op).next;
        }

        op_b = (*op).duplicate(is_right_order);

        if !(*op_b).point.almost_equal(point, None) {
            op = op_b;
            //op1.Pt = Pt;
            (*op).point.update(point);
            op_b = (*op).duplicate(is_right_order);
        }

        return (op, op_b, is_right_order);
    }

    pub unsafe fn first_is_bottom_pt(btm1: *mut OutPt, btm2: *mut OutPt) -> bool {
        let dx1p = (*btm1).get_distance(false);
        let dx1n = (*btm1).get_distance(true);
        let dx2p = (*btm2).get_distance(false);
        let dx2n = (*btm2).get_distance(true);

        let max_dx = dx2p.max(dx2n);

        dx1p >= max_dx || dx1n >= max_dx
    }

    pub unsafe fn join_horz(
        op1: *mut OutPt,
        op1b: *mut OutPt,
        op2: *mut OutPt,
        op2b: *mut OutPt,
        pt: *const Point<i32>,
        is_discard_left: bool,
    ) -> bool {
        let dir1 = (*op1).get_direction(op1b);
        let dir2 = (*op2).get_direction(op2b);

        if dir1 == dir2 {
            return false;
        }

        let (op1_inner, op1b_inner, is_right_order1) =
            (*op1).join_horz_inner(op1b, pt, is_discard_left);
        let (op2_inner, op2b_inner, _is_right_order2) =
            (*op2).join_horz_inner(op2b, pt, is_discard_left);

        if is_right_order1 {
            (*op1_inner).next = op2_inner;
            (*op2_inner).prev = op1_inner;
            (*op1b_inner).prev = op2b_inner;
            (*op2b_inner).next = op1b_inner;
        } else {
            (*op1_inner).prev = op2_inner;
            (*op2_inner).next = op1_inner;
            (*op1b_inner).next = op2b_inner;
            (*op2b_inner).prev = op1b_inner;
        }

        true
    }
}
