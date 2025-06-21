use crate::clipper::out_pt::OutPt;
use crate::clipper::out_rec::OutRec;
use crate::geometry::point::Point;

#[derive(Debug, PartialEq)]
pub struct Join {
    pub out_pt1: *mut OutPt,
    pub out_pt2: *mut OutPt,
    pub off_pt: Point<i32>,
}

impl Join {
    pub fn new(out_pt1: *mut OutPt, out_pt2: *mut OutPt, off_pt: Option<&Point<i32>>) -> Self {
        let pt = if let Some(p) = off_pt {
            Point::<i32>::from(p)
        } else {
            Point::<i32>::new(None, None)
        };

        Self {
            out_pt1,
            out_pt2,
            off_pt: pt,
        }
    }

    unsafe fn apply_join(&mut self, op1: *mut OutPt, op2: *mut OutPt, reverse: bool) {
        let op1b = (*op1).duplicate(!reverse);
        let op2b = (*op2).duplicate(reverse);

        if reverse {
            (*op1).prev = op2;
            (*op2).next = op1;
            (*op1b).next = op2b;
            (*op2b).prev = op1b;
        } else {
            (*op1).next = op2;
            (*op2).prev = op1;
            (*op1b).prev = op2b;
            (*op2b).next = op1b;
        }

        self.out_pt1 = op1;
        self.out_pt2 = op1b;
    }

    unsafe fn should_reverse(
        &self,
        op1: *mut OutPt,
        op2: *mut OutPt,
        use_full_range: bool,
    ) -> bool {
        (*op2).point.y > (*op1).point.y
            || !Point::slopes_equal(&(*op1).point, &(*op2).point, &self.off_pt, use_full_range)
    }

    unsafe fn get_join_stats(
        &self,
        op: *mut OutPt,
        use_full_range: bool,
    ) -> (*mut OutPt, bool, bool) {
        let mut opb = (*op).get_unique_pt(true);
        let mut is_joined = false;
        let reverse = self.should_reverse(op, opb, use_full_range);

        if reverse {
            opb = (*op).get_unique_pt(false);

            is_joined = self.should_reverse(op, opb, use_full_range);
        }

        is_joined = is_joined || opb == op;

        (opb, reverse, is_joined)
    }

    unsafe fn almost_equal(&self, op: *mut OutPt) -> bool {
        self.off_pt.almost_equal(&(*op).point, None)
    }

    unsafe fn get_horizontal_reverse(&self, op: *mut OutPt) -> bool {
        let mut opb = (*op).next;

        while opb != op && self.almost_equal(opb) {
            opb = (*opb).next;
        }

        (*opb).point.y > self.off_pt.y
    }

    pub unsafe fn join_points(&mut self, is_records_same: bool, use_full_range: bool) -> bool {
        let op1 = self.out_pt1;
        let op2 = self.out_pt2;

        let is_horizontal = (*op1).point.y == self.off_pt.y;

        if is_horizontal && self.almost_equal(op1) && self.almost_equal(op2) {
            // strictly simple join
            let reverse1 = self.get_horizontal_reverse(op1);
            let reverse2 = self.get_horizontal_reverse(op2);

            if reverse1 == reverse2 {
                return false;
            }

            self.apply_join(op1, op2, reverse1);

            return true;
        } else if is_horizontal {
            // horizontal join
            let (op1, op1b, is_joined1) = (*op1).check_join_b(op2, op2);

            if is_joined1 {
                return false;
            }

            let (op2, op2b, is_joined2) = (*op1).check_join_b(op1, op1b);

            if is_joined2 {
                return false;
            }

            let (val1, val2) = Join::get_overlap(
                (*op1).point.x,
                (*op1b).point.x,
                (*op2).point.x,
                (*op2b).point.x,
            );

            if val1 >= val2 {
                return false;
            }

            let mut pt = Point::new(None, None);
            let discard_left_side: bool;

            if (*op1).point.x >= val1 && (*op1).point.x <= val2 {
                pt.update(&(*op1).point);
                discard_left_side = (*op1).point.x > (*op1b).point.x;
            } else if (*op2).point.x >= val1 && (*op2).point.x <= val2 {
                pt.update(&(*op2).point);
                discard_left_side = (*op2).point.x > (*op2b).point.x;
            } else if (*op1b).point.x >= val1 && (*op1b).point.x <= val2 {
                pt.update(&(*op1b).point);
                discard_left_side = (*op1b).point.x > (*op1).point.x;
            } else {
                pt.update(&(*op2b).point);
                discard_left_side = (*op2b).point.x > (*op2).point.x;
            }

            self.out_pt1 = op1;
            self.out_pt2 = op2;

            return OutPt::join_horz(op1, op1b, op2, op2b, &pt, discard_left_side);
        } else {
            // non-horizontal join
            let (op1b, reverse1, is_joined1) = self.get_join_stats(op1, use_full_range);
            let (op2b, reverse2, is_joined2) = self.get_join_stats(op1, use_full_range);

            if is_joined1 || is_joined2 || op1b == op2b || (is_records_same && reverse1 == reverse2)
            {
                return false;
            }

            self.apply_join(op1, op2, reverse1);

            return true;
        }
    }

    pub unsafe fn join_common_edges(
        &mut self,
        records: &mut Vec<Box<OutRec>>,
        use_full_range: bool,
        reverse_solution: bool,
    ) {
        let out_rec1 = OutRec::get_out_rec(records, (*self.out_pt1).index as usize);
        let mut out_rec2 = OutRec::get_out_rec(records, (*self.out_pt2).index as usize);

        if (*out_rec1).pts.is_null()
            || (*out_rec2).pts.is_null()
            || !self.join_points(out_rec1 == out_rec2, use_full_range)
        {
            return;
        }

        if out_rec1 == out_rec2 {
            (*out_rec1).pts = self.out_pt1;
            (*out_rec1).bottom_pt = std::ptr::null_mut();

            out_rec2 = OutRec::create(records, None, None);
            (*out_rec2).pts = self.out_pt2;
            (*out_rec2).update_out_pt_idxs();

            if !(*out_rec2).join_common_edges(out_rec2, reverse_solution) {
                (*out_rec2).is_hole = (*out_rec1).is_hole;
                (*out_rec2).first_left = (*out_rec1).first_left;
                (*out_rec1).join_common_edges(out_rec2, reverse_solution);
            }

            return;
        }

        let hole_state_rec = OutRec::get_hole_state_rec(out_rec1, out_rec2);
        (*out_rec2).pts = std::ptr::null_mut();
        (*out_rec2).bottom_pt = std::ptr::null_mut();
        (*out_rec2).idx = (*out_rec1).idx;
        (*out_rec1).is_hole = (*hole_state_rec).is_hole;

        if hole_state_rec == out_rec2 {
            (*out_rec1).first_left = (*out_rec2).first_left;
        }

        (*out_rec2).first_left = out_rec1;
    }

    pub fn get_overlap(a1: i32, a2: i32, b1: i32, b2: i32) -> (i32, i32) {
        if a1 < a2 {
            if b1 < b2 {
                (a1.max(b1), a2.min(b2))
            } else {
                (a1.max(b2), a2.min(b1))
            }
        } else {
            if b1 < b2 {
                (a2.max(b1), a1.min(b2))
            } else {
                (a2.max(b2), a1.min(b1))
            }
        }
    }
}
