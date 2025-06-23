use crate::clipper::clipper_instance::ClipperInstance;
use crate::clipper::clipper_pool_manager::get_pool;
use crate::clipper::enums::Direction;
use crate::clipper::out_pt::OutPt;
use crate::clipper::t_edge::TEdge;
use crate::geometry::point::Point;
use std::ptr;
pub struct OutRec {
    pub idx: usize,
    pub is_hole: bool,
    pub is_open: bool,
    pub first_left: *mut OutRec,
    pub pts: *mut OutPt,
    pub bottom_pt: *mut OutPt,
}

impl ClipperInstance for OutRec {
    fn new() -> Self {
        Self {
            idx: 0,
            is_hole: false,
            is_open: false,
            first_left: ptr::null_mut(),
            pts: ptr::null_mut(),
            bottom_pt: ptr::null_mut(),
        }
    }

    fn clean(&mut self) {
        self.idx = 0;
        self.is_hole = false;
        self.is_open = false;
        self.first_left = ptr::null_mut();
        self.pts = ptr::null_mut();
        self.bottom_pt = ptr::null_mut();
    }
}

impl OutRec {
    pub fn init(&mut self, idx: usize, is_open: bool, pts: *mut OutPt) {
        self.idx = idx;
        self.is_hole = false;
        self.is_open = is_open;
        self.first_left = ptr::null_mut();
        self.pts = pts;
        self.bottom_pt = ptr::null_mut();
    }

    pub unsafe fn fixup_out_polygon(&mut self, preserve_collinear: bool, use_full_range: bool) {
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        self.bottom_pt = ptr::null_mut();

        let mut last_out_pt: *mut OutPt = ptr::null_mut();
        let mut out_pt = self.pts;

        loop {
            if !out_pt.is_null() && (ptr::eq((*out_pt).prev, out_pt) || ptr::eq((*out_pt).prev, (*out_pt).next)) {
                (*out_pt).dispose();
                self.pts = ptr::null_mut();

                return;
            }

            let next_pt = (*out_pt).next;
            let prev_pt = (*out_pt).prev;
            //test for duplicate points and collinear edges ...
            if (*out_pt).point.almost_equal(&(*next_pt).point, None)
                || (*out_pt).point.almost_equal(&(*prev_pt).point, None)
                || (Point::<i32>::slopes_equal(
                    &(*prev_pt).point,
                    &(*out_pt).point,
                    &(*next_pt).point,
                    use_full_range,
                ) && (!preserve_collinear
                    || !(*out_pt)
                        .point
                        .get_between(&mut (*prev_pt).point, &mut (*next_pt).point)))
            {
                last_out_pt = ptr::null_mut();
                (*prev_pt).next = next_pt;
                (*next_pt).prev = prev_pt;
                out_pt = prev_pt;

                continue;
            }

            if ptr::eq(out_pt, last_out_pt) {
                break;
            }

            if last_out_pt.is_null() {
                last_out_pt = out_pt;
            }

            out_pt = (*out_pt).next;
        }

        self.pts = out_pt;
    }

    pub unsafe fn reverse_pts(&self) {
        if !self.pts.is_null() {
            (*self.pts).reverse();
        }
    }

    pub unsafe fn dispose(&self) {
        if !self.pts.is_null() {
            (*self.pts).dispose();
        }
    }

    pub unsafe fn export(&self) -> Option<Vec<*mut Point<i32>>> {
        let point_count = self.point_count();

        if point_count < 2 {
            return None;
        }

        let mut result = Vec::new();
        let mut out_pt = (*self.pts).prev;

        for _ in 0..point_count {
            result.push(&mut (*out_pt).point as *mut Point<i32>);
            out_pt = (*out_pt).prev;
        }

        return Some(result);
    }

    pub unsafe fn join_common_edges(
        &mut self,
        out_rec: *mut OutRec,
        is_reverse_solution: bool,
    ) -> bool {
        if !(*out_rec).contains_poly(self) {
            return false;
        }
        //out_rec1 is contained by out_rec2 ...
        self.is_hole = !(*out_rec).is_hole;
        self.first_left = out_rec;

        if (self.is_hole != is_reverse_solution) == (self.area() > 0.0) {
            (*self.pts).reverse();
        }

        return true;
    }

    pub unsafe fn update_out_pt_idxs(&self) {
        let mut out_pt = self.pts;

        loop {
            (*out_pt).index = self.idx as i32;
            out_pt = (*out_pt).prev;

            if ptr::eq(out_pt, self.pts) {
                break;
            }
        }
    }

    unsafe fn contains_poly(&self, out_rec: *mut OutRec) -> bool {
        let mut out_pt = (*out_rec).pts;

        loop {
            let res = (*self.pts).point_in(&(*out_pt).point);

            if res >= 0 {
                return res != 0;
            }

            out_pt = (*out_pt).next;

            if ptr::eq(out_pt, (*out_rec).pts) {
                break;
            }
        }

        return true;
    }

    pub unsafe fn point_count(&self) -> usize {
        if !self.pts.is_null() && !(*self.pts).prev.is_null() {
            (*(*self.pts).prev).point_count()
        } else {
            0
        }
    }

    pub unsafe fn is_empty(&self) -> bool {
        return self.pts.is_null() || self.is_open;
    }

    pub unsafe fn area(&self) -> f64 {
        if self.pts.is_null() {
            return 0.0;
        }

        let mut out_pt = self.pts;
        let mut result = 0.0;

        loop {
            let prev_pt = (*out_pt).prev;

            result += (((*prev_pt).point.x + (*out_pt).point.x) as f64)
                * (((*prev_pt).point.y - (*out_pt).point.y) as f64);
            out_pt = (*out_pt).next;

            if ptr::eq(out_pt, self.pts) {
                break;
            }
        }

        return result * 0.5;
    }

    pub unsafe fn set_hole_state(&mut self, input_edge: *mut TEdge, outs: &mut Vec<*mut OutRec>) {
        let mut is_hole = false;
        let mut edge = (*input_edge).prev_in_ael;

        while !edge.is_null() {
            if (*edge).is_assigned() && !(*edge).is_wind_delta_empty() {
                is_hole = !is_hole;

                if self.first_left.is_null() {
                    self.first_left = outs[(*edge).index as usize];
                }
            }

            edge = (*edge).prev_in_ael;
        }

        if is_hole {
            self.is_hole = true;
        }
    }

    pub unsafe fn simplify(&mut self, out_pt: *mut OutPt, output: &mut Vec<*mut OutRec>) {
        let mut inner_pt = out_pt;

        loop
        //for each Pt in Polygon until duplicate found do ...
        {
            let mut op2 = (*inner_pt).next;

            while !ptr::eq(op2, self.pts) {
                if (*inner_pt).point.almost_equal(&(*op2).point, None)
                    && !ptr::eq((*op2).next, inner_pt)
                    && !ptr::eq((*op2).prev, inner_pt)
                {
                    //split the polygon into two ...
                    let op3 = (*inner_pt).prev;
                    let op4 = (*op2).prev;
                    (*inner_pt).prev = op4;
                    (*op4).next = inner_pt;
                    (*op2).prev = op3;
                    (*op3).next = op2;
                    self.pts = inner_pt;
                    let raw_rec = OutRec::create(output, None, None);
                    (*raw_rec).pts = op2;
                    (*raw_rec).update_out_pt_idxs();

                    if self.contains_poly(raw_rec) {
                        //OutRec2 is contained by OutRec1 ...
                        (*raw_rec).is_hole = !self.is_hole;
                        (*raw_rec).first_left = self;
                    } else if (*raw_rec).contains_poly(self) {
                        //OutRec1 is contained by OutRec2 ...
                        (*raw_rec).is_hole = self.is_hole;
                        self.is_hole = !(*raw_rec).is_hole;
                        (*raw_rec).first_left = self.first_left;
                        self.first_left = raw_rec;
                    } else {
                        //the 2 polygons are separate ...
                        (*raw_rec).is_hole = self.is_hole;
                        (*raw_rec).first_left = self.first_left;
                    }

                    op2 = inner_pt;
                    //ie get ready for the next iteration
                }

                op2 = (*op2).next;
            }

            inner_pt = (*inner_pt).next;

            if ptr::eq(inner_pt, self.pts) {
                break;
            }
        }
    }

    pub unsafe fn param1_right_of_param2(out_rec1: *mut OutRec, out_rec2: *mut OutRec) -> bool {
        let mut out_rec = out_rec1;

        loop {
            out_rec = (*out_rec).first_left;

            if ptr::eq(out_rec, out_rec2) {
                return true;
            }

            if out_rec.is_null() {
                break;
            }
        }

        return false;
    }

    pub unsafe fn parse_first_left(first_left: *mut OutRec) -> *mut OutRec {
        let mut result = first_left;

        while !result.is_null() && (*result).pts.is_null() {
            result = (*result).first_left;
        }

        return result;
    }

    pub unsafe fn get_lowermost_rec(out_rec1: *mut OutRec, out_rec2: *mut OutRec) -> *mut OutRec {
        //work out which polygon fragment has the correct hole state ...
        if (*out_rec1).bottom_pt.is_null() {
            (*out_rec1).bottom_pt = (*(*out_rec1).pts).get_bottom_pt();
        }
        if (*out_rec2).bottom_pt.is_null() {
            (*out_rec2).bottom_pt = (*(*out_rec2).pts).get_bottom_pt();
        }

        let b_pt1 = (*out_rec1).bottom_pt;
        let b_pt2 = (*out_rec2).bottom_pt;

        if (*b_pt1).point.y > (*b_pt2).point.y {
            out_rec1
        } else if (*b_pt1).point.y < (*b_pt2).point.y {
            out_rec2
        } else if (*b_pt1).point.x < (*b_pt2).point.x {
            out_rec1
        } else if (*b_pt1).point.x > (*b_pt2).point.x {
            out_rec2
        } else if ptr::eq((*b_pt1).next, b_pt1) {
            out_rec2
        } else if ptr::eq((*b_pt2).next, b_pt2) {
            out_rec1
        } else if OutPt::first_is_bottom_pt(b_pt1, b_pt2) {
            out_rec1
        } else {
            return out_rec2;
        }
    }

    pub unsafe fn add_out_pt(
        records: &mut Vec<*mut OutRec>,
        edge: *mut TEdge,
        point: *const Point<i32>,
    ) -> *mut OutPt {
        let is_to_front = (*edge).side == Direction::Left;

        if !(*edge).is_assigned() {
            // create new outpt
            let new_op = OutPt::create(0, Some(&(*point)));
            let out_rec =
                OutRec::create(records, Some((*edge).is_wind_delta_empty()), Some(new_op));
            (*new_op).index = (*out_rec).idx as i32;

            // close the loop
            (*new_op).next = new_op;
            (*new_op).prev = new_op;

            if !(*out_rec).is_open {
                (*out_rec).set_hole_state(edge, records);
            }

            (*edge).index = (*out_rec).idx as i32;

            return new_op;
        }

        let out_rec = records[(*edge).index as usize];
        let op = (*out_rec).pts;

        if is_to_front && (*point).almost_equal(&(*op).point, None) {
            return op;
        }

        if !is_to_front && (*point).almost_equal(&(*(*op).prev).point, None) {
            return (*op).prev;
        }

        // insert new outpt
        let new_op = OutPt::create(
            ((*out_rec).idx as usize).try_into().unwrap(),
            Some(&(*point)),
        );
        (*new_op).next = op;
        (*new_op).prev = (*op).prev;

        (*(*new_op).prev).next = new_op;
        (*op).prev = new_op;

        if is_to_front {
            (*out_rec).pts = new_op;
        }

        new_op
    }

    pub unsafe fn get_out_rec(records: &mut Vec<*mut OutRec>, mut idx: usize) -> *mut OutRec {
        let mut result: *mut OutRec = records[idx];

        while !ptr::eq(result, records[(*result).idx]) {
            idx = (*result).idx;
            result = records[idx];
        }

        result
    }

    pub unsafe fn get_hole_state_rec(out_rec1: *mut OutRec, out_rec2: *mut OutRec) -> *mut OutRec {
        if OutRec::param1_right_of_param2(out_rec1, out_rec2) {
            out_rec2
        } else if OutRec::param1_right_of_param2(out_rec2, out_rec1) {
            out_rec1
        } else {
            OutRec::get_lowermost_rec(out_rec1, out_rec2)
        }
    }

    pub unsafe fn add_local_max_poly(
        records: &mut Vec<*mut OutRec>,
        edge1: *mut TEdge,
        edge2: *mut TEdge,
        point: *const Point<i32>,
        mut active_edge: *mut TEdge,
    ) {
        let _ = OutRec::add_out_pt(records, edge1, point);

        if (*edge2).is_wind_delta_empty() {
            let _ = OutRec::add_out_pt(records, edge2, point);
        }

        if (*edge1).index == (*edge2).index {
            (*edge1).unassign();
            (*edge2).unassign();
            return;
        }

        let (first_edge, second_edge) = if (*edge1).index < (*edge2).index {
            (edge1, edge2)
        } else {
            (edge2, edge1)
        };

        let out_rec1 = records[(*first_edge).index as usize];
        let out_rec2 = records[(*second_edge).index as usize];

        let hole_state_rec = OutRec::get_hole_state_rec(out_rec1, out_rec2);

        let p1_lft = (*out_rec1).pts;
        let p1_rt = (*p1_lft).prev;
        let p2_lft = (*out_rec2).pts;
        let p2_rt = (*p2_lft).prev;

        let side = if (*first_edge).side == Direction::Left {
            if (*second_edge).side == Direction::Left {
                (*p2_lft).reverse();
                (*p2_lft).next = p1_lft;
                (*p1_lft).prev = p2_lft;
                (*p1_rt).next = p2_rt;
                (*p2_rt).prev = p1_rt;
                (*out_rec1).pts = p2_rt;
            } else {
                (*p2_rt).next = p1_lft;
                (*p1_lft).prev = p2_rt;
                (*p2_lft).prev = p1_rt;
                (*p1_rt).next = p2_lft;
                (*out_rec1).pts = p2_lft;
            }
            Direction::Left
        } else {
            if (*second_edge).side == Direction::Right {
                (*p2_lft).reverse();
                (*p1_rt).next = p2_rt;
                (*p2_rt).prev = p1_rt;
                (*p2_lft).next = p1_lft;
                (*p1_lft).prev = p2_lft;
            } else {
                (*p1_rt).next = p2_lft;
                (*p2_lft).prev = p1_rt;
                (*p1_lft).prev = p2_rt;
                (*p2_rt).next = p1_lft;
            }
            Direction::Right
        };

        (*out_rec1).bottom_pt = std::ptr::null_mut();

        if ptr::eq(hole_state_rec, out_rec2) {
            if !ptr::eq((*out_rec2).first_left, out_rec1) {
                (*out_rec1).first_left = (*out_rec2).first_left;
            }
            (*out_rec1).is_hole = (*out_rec2).is_hole;
        }

        (*out_rec2).pts = std::ptr::null_mut();
        (*out_rec2).bottom_pt = std::ptr::null_mut();
        (*out_rec2).first_left = out_rec1;
        let ok_idx = (*first_edge).index;
        let obsolete_idx = (*second_edge).index;

        (*first_edge).unassign();
        (*second_edge).unassign();

        while !active_edge.is_null() {
            if (*active_edge).index == obsolete_idx {
                (*active_edge).index = ok_idx;
                (*active_edge).side = side;
                break;
            }
            active_edge = (*active_edge).next_in_ael;
        }

        (*out_rec2).idx = (*out_rec1).idx;
    }

    pub unsafe fn create(
        output: &mut Vec<*mut OutRec>,
        is_open: Option<bool>,
        pointer: Option<*mut OutPt>,
    ) -> *mut OutRec {
        let ptr = get_pool().out_rec_pool.get();

        (*ptr).init(
            output.len(),
            is_open.unwrap_or(false),
            pointer.unwrap_or(ptr::null_mut()),
        );

        output.push(ptr);

        return ptr;
    }
}
