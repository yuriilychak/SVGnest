use crate::geometry::point::Point;
use crate::utils::bit_ops::{get_u16, join_u16};

use crate::clipper::constants::UNASSIGNED;
use crate::clipper::enums::Direction;

pub struct OutRec {
    rec_data: Vec<[usize; 4]>,
    point_neighboars: Vec<[usize; 2]>,
    points: Vec<Point<i32>>,
    is_reverse_solution: bool,
    is_strictly_simple: bool,
}

impl OutRec {
    pub fn new(is_reverse_solution: bool, is_strictly_simple: bool) -> Self {
        Self {
            rec_data: Vec::new(),
            point_neighboars: Vec::new(),
            points: Vec::new(),
            is_reverse_solution,
            is_strictly_simple,
        }
    }

    pub fn strictly_simple(&self) -> bool {
        self.is_strictly_simple
    }

    pub fn is_unassigned(&self, index: usize) -> bool {
        self.rec_data[index - 1][0] == UNASSIGNED
    }

    pub fn current_index(&self, index: usize) -> usize {
        self.rec_data[index - 1][1] 
    }

    fn set_current_index(&mut self, index1: usize, index2: usize) {
        self.rec_data[index1 - 1][1] = self.rec_data[index2 - 1][1];
    }

    pub fn first_left_index(&self, index: usize) -> usize {
        if index  != UNASSIGNED {
            self.rec_data[index - 1][2]
        } else {
            UNASSIGNED
        }
    }

    fn set_first_left_index(&mut self, index: usize, value: usize) {
        self.rec_data[index - 1][2] = value;
    }

    fn get_hole_state_rec(&self, index1: usize, index2: usize) -> usize {
        if self.param1_right_of_param2(index1, index2) {
            index2
        } else if self.param1_right_of_param2(index2, index1) {
            index1
        } else {
            self.get_lowermost_rec(index1, index2)
        }
    }

    pub fn set_hole_state(&mut self, rec_index: usize, is_hole: bool, index: usize) {
        if self.first_left_index(rec_index) == UNASSIGNED && index != UNASSIGNED {
            self.set_first_left_index(rec_index, index);
        }

        if is_hole {
            self.set_hole(rec_index, true);
        }
    }

    pub fn get_join_data(
        &self,
        rec_index: usize,
        direction: Direction,
        top: &Point<i32>,
        bottom: &Point<i32>,
    ) -> (u32, i32, i32) {
        let index = if direction == Direction::Right {
            self.prev(self.point_index(rec_index) ) 
        } else {
            self.point_index(rec_index) 
        };

        let off_point = if self.point_equal(index, top) {
            bottom
        } else {
            top
        };

        (self.get_hash(rec_index, index), off_point.x, off_point.y)
    }

    pub fn get_out_rec(&self, index: usize) -> usize {
        let mut result = index;
        while result != self.current_index(result) {
            result = self.current_index(result);
        }
        result
    }

    fn export(&self, rec_index: usize) -> Vec<Point<i32>> {
        let index = self.point_index(rec_index) ;
        let point_count = self.get_length(index);

        let mut result: Vec<Point<i32>> = Vec::new();

        if point_count < 2 {
            return result;
        }

        let prev_index = self.prev(index) ;
        let mut out_pt = prev_index;

        for _i in 0..point_count {
            result.push(Point::new(
                Some(self.point_x(out_pt)),
                Some(self.point_y(out_pt)),
            ));
            out_pt = self.prev(out_pt) ;
        }

        result
    }

    pub fn build_result(&self, polygons: &mut Vec<Vec<Point<i32>>>) {
        for i in 0..self.rec_data.len() {
            let polygon = if self.is_unassigned(i) {
                Vec::new()
            } else {
                self.export(i)
            };

            if !polygon.is_empty() {
                polygons.push(polygon);
            }
        }
    }

    pub fn fix_directions(&mut self) {
        for i in 0..self.rec_data.len() {
            self.reverse(i);
        }
    }

    pub fn create(&mut self, point_index: usize) -> usize {
        let index = self.rec_data.len() + 1;
        self.rec_data
            .push([point_index, index , UNASSIGNED, 0]);
        index
    }

    pub fn dispose(&mut self) {
        self.rec_data.clear();
        self.points.clear();
        self.point_neighboars.clear();
    }

    fn fixup_out_polygon_inner(
        &mut self,
        rec_index: usize,
        preserve_collinear: bool,
        use_full_range: bool,
    ) -> usize {
        let index = self.point_index(rec_index) ;
        let mut last_out_index = UNASSIGNED;
        let mut out_pt = index;

        loop {
            if self.prev(out_pt) == out_pt  || self.prev(out_pt) == self.next(out_pt) {
                return UNASSIGNED;
            }

            let next_pt = self.next(out_pt) ;
            let prev_pt = self.prev(out_pt) ;

            let slopes_equal = unsafe {
                Point::<i32>::slopes_equal(
                    &self.points[prev_pt - 1],
                    &self.points[out_pt - 1],
                    &self.points[next_pt - 1],
                    use_full_range,
                )
            };

            let is_between = unsafe {
                self.points[out_pt - 1].get_between(&self.points[prev_pt - 1], &self.points[next_pt - 1])
            };

            if self.inner_equal(out_pt, prev_pt)
                || self.inner_equal(out_pt, next_pt)
                || (slopes_equal && !(preserve_collinear && is_between))
            {
                last_out_index = UNASSIGNED;
                out_pt = self.remove(out_pt) ;
                continue;
            }

            if out_pt  == last_out_index {
                break;
            }

            if last_out_index == UNASSIGNED {
                last_out_index = out_pt ;
            }

            out_pt = self.next(out_pt) ;
        }

        out_pt 
    }

    pub fn fix_out_polygon(&mut self, is_use_full_range: bool) {
        for i in 0..self.rec_data.len() {
            if !self.is_unassigned(i) {
                let index = self.fixup_out_polygon_inner(i, false, is_use_full_range);
                self.set_point_index(i, index);
            }
        }

        if self.is_strictly_simple {
            for i in 0..self.rec_data.len() {
                self.simplify(i);
            }
        }
    }

    fn get_lowermost_rec(&self, out_rec1_index: usize, out_rec2_index: usize) -> usize {
        let b_index1 = self.get_bottom_pt(out_rec1_index);
        let b_index2 = self.get_bottom_pt(out_rec2_index);
        let offset_x = self.point_x(b_index1) - self.point_x(b_index2);
        let offset_y = self.point_y(b_index1) - self.point_y(b_index2);

        if offset_y != 0 {
            if offset_y > 0 {
                out_rec1_index
            } else {
                out_rec2_index
            }
        } else if offset_x != 0 {
            if offset_x < 0 {
                out_rec1_index
            } else {
                out_rec2_index
            }
        } else if self.next(b_index1) == b_index1  {
            out_rec2_index
        } else if self.next(b_index2) == b_index2  {
            out_rec1_index
        } else if self.first_is_bottom_pt(b_index1, b_index2) {
            out_rec1_index
        } else {
            out_rec2_index
        }
    }

    fn split(&mut self, op1_index: usize, op2_index: usize) {
        let op1_prev = self.prev(op1_index) ;
        let op2_prev = self.prev(op2_index) ;

        self.push(op2_prev, op1_index, true);
        self.push(op1_prev, op2_index, true);
    }

    fn can_split(&self, index1: usize, index2: usize) -> bool {
        self.inner_equal(index2, index1)
            && self.next(index2) != index1 
            && self.prev(index2) != index1 
    }

    fn simplify(&mut self, rec_index: usize) {
        if self.is_unassigned(rec_index) {
            return;
        }

        let input_index = self.point_index(rec_index) ;
        let mut curr_index = self.point_index(rec_index) ;
        let mut split_index;

        loop {
            split_index = self.next(curr_index) ;

            while split_index  != self.point_index(rec_index) {
                if self.can_split(curr_index, split_index) {
                    self.split(curr_index, split_index);
                    self.set_point_index(rec_index, curr_index );
                    let out_rec_index = self.create(split_index );
                    self.update_split(rec_index, out_rec_index);
                    split_index = curr_index;
                }
                split_index = self.next(split_index) ;
            }

            curr_index = self.next(curr_index) ;
            if curr_index == input_index {
                break;
            }
        }
    }

    fn update_split(&mut self, index1: usize, index2: usize) {
        if self.contains_poly(index1, index2) {
            self.set_hole(index2, !self.is_hole(index1));
            self.set_first_left_index(index2, index1 );
        } else if self.contains_poly(index2, index1) {
            self.set_hole(index2, self.is_hole(index1));
            self.set_hole(index1, !self.is_hole(index2));
            self.set_first_left_index(index2, self.first_left_index(index1));
            self.set_first_left_index(index1, index2 );
        } else {
            self.set_hole(index2, self.is_hole(index1));
            self.set_first_left_index(index2, self.first_left_index(index1));
        }
    }

    fn post_init(&mut self, rec_index: usize) {
        self.set_hole(rec_index, !self.is_hole(rec_index));
        self.set_first_left_index(rec_index, rec_index );
        self.reverse(rec_index);
    }

    fn get_length(&self, index: usize) -> usize {
        let prev_index = self.prev(index);
        if prev_index == UNASSIGNED {
            return 0;
        }

        let mut result = 0;
        let mut out_pt = prev_index ;
        loop {
            result += 1;
            out_pt = self.next(out_pt) ;
            if out_pt  == prev_index {
                break;
            }
        }
        result
    }

    fn join(&mut self, rec_index1: usize, rec_index2: usize, side1: Direction, side2: Direction) {
        let index1 = self.point_index(rec_index1) ;
        let index2 = self.point_index(rec_index2) ;
        let prev_index1 = self.prev(index1) ;
        let prev_index2 = self.prev(index2) ;
        let is_left = side1 == Direction::Left;
        let point_index;

        if side1 == side2 {
            self.reverse_inner(index2);
            self.push(index2, index1, true);
            self.push(prev_index1, prev_index2, true);
            point_index = if is_left { prev_index2 } else { index1 };
        } else {
            self.push(prev_index1, index2, true);
            self.push(prev_index2, index1, true);
            point_index = if is_left { index2 } else { index1 };
        }

        self.set_point_index(rec_index1, point_index );
    }

    pub fn get_hash(&self, rec_index: usize, point_index: usize) -> u32 {
        join_u16(rec_index as u16, point_index as u16)
    }

    pub fn add_out_pt(&mut self, rec_index: usize, is_to_front: bool, point: &Point<i32>) -> usize {
        let out_rec = self.get_out_rec(rec_index);
        let op = self.point_index(out_rec) ;

        if is_to_front && self.point_equal(op, point) {
            return op;
        }

        let prev = self.prev(op) ;
        if !is_to_front && self.point_equal(prev, point) {
            return prev;
        }

        let new_index = self.create_out_pt(point.x, point.y);
        self.push(self.prev(op) , new_index, true);
        self.push(new_index, op, true);

        if is_to_front {
            self.set_point_index(out_rec, new_index );
        }

        new_index
    }

    fn point_in(&self, input_index: usize, out_index: usize) -> isize {
        let out_x = self.point_x(out_index);
        let out_y = self.point_y(out_index);
        let mut out_pt = input_index;
        let start_out_pt = out_pt;
        let mut result = 0;

        loop {
            let next_pt = self.next(out_pt) ;
            let poly0x = self.point_x(out_pt);
            let poly0y = self.point_y(out_pt);
            let poly1x = self.point_x(next_pt);
            let poly1y = self.point_y(next_pt);

            if poly1y == out_y {
                if poly1x == out_x || (poly0y == out_y && (poly1x > out_x) == (poly0x < out_x)) {
                    return -1;
                }
            }

            if (poly0y < out_y) != (poly1y < out_y) {
                let offset_x0 = poly0x - out_x;
                let offset_x1 = poly1x - out_x;

                if offset_x0 >= 0 && offset_x1 > 0 {
                    result = 1 - result;
                } else if (offset_x0 >= 0 && offset_x1 <= 0) || (offset_x0 < 0 && offset_x1 > 0) {
                    let d = offset_x0 as i64 * (poly1y - out_y) as i64
                        - offset_x1 as i64 * (poly0y - out_y) as i64;

                    if d == 0 {
                        return -1;
                    }

                    if (d > 0) == (poly1y > poly0y) {
                        result = 1 - result;
                    }
                }
            }

            out_pt = self.next(out_pt) ;
            if start_out_pt == out_pt {
                break;
            }
        }

        result
    }

    fn point_index(&self, index: usize) -> usize {
        self.rec_data[index - 1][0]
    }

    fn set_point_index(&mut self, index: usize, value: usize) {
        self.rec_data[index - 1][0] = value;
    }

    fn is_hole(&self, index: usize) -> bool {
        self.rec_data[index - 1][3] == 1
    }

    fn set_hole(&mut self, index: usize, value: bool) {
        self.rec_data[index - 1][3] = if value { 1 } else { 0 };
    }

    fn param1_right_of_param2(&self, out_rec1_index: usize, out_rec2_index: usize) -> bool {
        let mut inner_index = out_rec1_index ;
        loop {
            inner_index = self.first_left_index(inner_index );
            if inner_index == out_rec2_index  {
                return true;
            }
            if inner_index == UNASSIGNED {
                break;
            }
        }
        false
    }

    fn contains_poly(&self, rec_index1: usize, rec_index2: usize) -> bool {
        let index1 = self.point_index(rec_index1) ;
        let index2 = self.point_index(rec_index2) ;
        let mut curr_index = index2;

        loop {
            let res = self.point_in(index1, curr_index);
            if res >= 0 {
                return res != 0;
            }
            curr_index = self.next(curr_index) ;
            if curr_index == index2 {
                break;
            }
        }
        true
    }

    fn reverse(&mut self, index: usize) {
        if !self.is_unassigned(index)
            && (self.is_hole(index) != self.is_reverse_solution) == (self.get_area(index) > 0.0)
        {
            self.reverse_inner(self.point_index(index) );
        }
    }

    fn get_area(&self, rec_index: usize) -> f64 {
        let index = self.point_index(rec_index) ;
        let mut out_pt = index;
        let mut result: i64 = 0;

        loop {
            let prev_pt = self.prev(out_pt) ;
            result += (self.point_x(prev_pt) as i64 + self.point_x(out_pt) as i64)
                * (self.point_y(prev_pt) as i64 - self.point_y(out_pt) as i64);
            out_pt = self.next(out_pt) ;
            if out_pt == index {
                break;
            }
        }
        result as f64 * 0.5
    }

    fn get_bottom_pt(&self, rec_index: usize) -> usize {
        let input_index = self.point_index(rec_index) ;
        let mut out_index1 = input_index;
        let mut out_index2 = self.next(input_index) ;
        let mut dups_index = UNASSIGNED;

        while out_index2 != out_index1 {
            if self.point_y(out_index2) > self.point_y(out_index1) {
                dups_index = UNASSIGNED;
                out_index1 = out_index2;
            } else if self.point_y(out_index2) == self.point_y(out_index1)
                && self.point_x(out_index2) <= self.point_x(out_index1)
            {
                if self.point_x(out_index2) < self.point_x(out_index1) {
                    dups_index = UNASSIGNED;
                    out_index1 = out_index2;
                } else if self.next(out_index2) != out_index1 
                    && self.prev(out_index2) != out_index1 
                {
                    dups_index = out_index2 ;
                }
            }
            out_index2 = self.next(out_index2) ;
        }

        if dups_index != UNASSIGNED {
            let mut dups_index_usize = dups_index ;
            while dups_index_usize != out_index2 {
                if !self.first_is_bottom_pt(out_index2, dups_index_usize) {
                    out_index1 = dups_index_usize;
                }
                dups_index_usize = self.next(dups_index_usize) ;
                while !self.inner_equal(dups_index_usize, out_index1) {
                    dups_index_usize = self.next(dups_index_usize) ;
                }
            }
        }
        out_index1
    }

    fn search_bottom(
        &self,
        index: usize,
        out_index1: usize,
        out_index2: usize,
        is_next: bool,
    ) -> usize {
        let mut curr_index = index;
        let mut nghb_index = self.get_neighboar_index(curr_index, is_next) ;

        while self.point_y(nghb_index) == self.point_y(curr_index)
            && nghb_index != out_index1
            && nghb_index != out_index2
        {
            curr_index = nghb_index;
            nghb_index = self.get_neighboar_index(curr_index, is_next) ;
        }
        curr_index
    }

    pub fn flat_horizontal(
        &self,
        index: usize,
        out_index1: usize,
        out_index2: usize,
    ) -> (usize, usize) {
        let out_index = self.search_bottom(index, index, out_index2, false);
        let out_b_index = self.search_bottom(index, out_index, out_index1, true);
        let out_b_index_next = self.next(out_b_index);

        if out_b_index_next == out_index  || out_b_index_next == out_index1  {
            (UNASSIGNED, UNASSIGNED)
        } else {
            (out_index , out_b_index )
        }
    }

    pub fn strictly_simple_join(&self, index: usize, point: &Point<i32>) -> bool {
        let mut result = self.next(index) ;
        while result != index && self.point_equal(result, point) {
            result = self.next(result) ;
        }
        self.point_y(result) > point.y
    }

    pub fn apply_join(&mut self, index1: usize, index2: usize, reverse: bool) -> usize {
        let op1b = self.duplicate(index1, !reverse);
        let op2b = self.duplicate(index2, reverse);

        if reverse {
            self.push(index2, index1, true);
            self.push(op1b, op2b, true);
        } else {
            self.push(index1, index2, true);
            self.push(op2b, op1b, true);
        }
        op1b
    }

    pub fn get_unique_pt(&self, index: usize, is_next: bool) -> usize {
        let mut result = self.get_neighboar_index(index, is_next) ;
        while self.inner_equal(result, index) && result != index {
            result = self.get_neighboar_index(result, is_next) ;
        }
        result
    }

    fn reverse_inner(&mut self, index: usize) {
        let mut pp1 = index;
        loop {
            let pp2 = self.next(pp1) ;
            self.set_next(pp1, self.prev(pp1));
            self.set_prev(pp1, pp2 );
            pp1 = pp2;
            if pp1 == index {
                break;
            }
        }
    }

    fn remove(&mut self, index: usize) -> usize {
        let result = self.prev(index);
        self.push(self.prev(index) , self.next(index) , true);
        self.set_prev(index, UNASSIGNED);
        self.set_next(index, UNASSIGNED);
        result
    }

    fn first_is_bottom_pt(&self, btm_index1: usize, btm_index2: usize) -> bool {
        let dx1p = self.get_distance(btm_index1, false);
        let dx1n = self.get_distance(btm_index1, true);
        let dx2p = self.get_distance(btm_index2, false);
        let dx2n = self.get_distance(btm_index2, true);

        let max_dx = dx2p.max(dx2n);
        dx1p >= max_dx || dx1n >= max_dx
    }

    fn join_horz_int2(&self, point: &mut Point<i32>, index1: usize, index2: usize) -> bool {
        point.x = self.point_x(index1);
        point.y = self.point_y(index1);
        self.point_x(index1) > self.point_x(index2)
    }

    pub fn join_horz(
        &mut self,
        op1_index: usize,
        op1b_index: usize,
        op2_index: usize,
        op2b_index: usize,
        left_bound: i32,
        right_bound: i32,
    ) -> bool {
        let direction1 = self.get_direction(op1_index, op1b_index);
        let direction2 = self.get_direction(op2_index, op2b_index);

        if direction1 == direction2 {
            return false;
        }

        let mut point = Point::new(None, None);
        let is_discard_left;

        if self.point_x(op1_index) >= left_bound && self.point_x(op1_index) <= right_bound {
            is_discard_left = self.join_horz_int2(&mut point, op1_index, op1b_index);
        } else if self.point_x(op2_index) >= left_bound && self.point_x(op2_index) <= right_bound {
            is_discard_left = self.join_horz_int2(&mut point, op2_index, op2b_index);
        } else if self.point_x(op1b_index) >= left_bound && self.point_x(op1b_index) <= right_bound
        {
            is_discard_left = self.join_horz_int2(&mut point, op1b_index, op1_index);
        } else {
            is_discard_left = self.join_horz_int2(&mut point, op2b_index, op2_index);
        }

        let join1 = self.join_horz_int(op1_index, op1b_index, &point, is_discard_left);
        let join2 = self.join_horz_int(op2_index, op2b_index, &point, is_discard_left);

        self.push(join1.0, join2.0, join1.2);
        self.push(join1.1, join2.1, !join1.2);

        true
    }

    fn join_horz_int(
        &mut self,
        index1: usize,
        index2: usize,
        point: &Point<i32>,
        is_discard_left: bool,
    ) -> (usize, usize, bool) {
        let mut op = index1;

        let direction = self.get_direction(index1, index2);
        let is_right = direction == Direction::Right;
        let is_right_order = is_discard_left != is_right;

        while self.get_discarded(op, is_right, point) {
            op = self.next(op) ;
        }

        if !is_right_order && self.point_x(op) != point.x {
            op = self.next(op) ;
        }

        let mut op_b = self.duplicate(op, is_right_order);

        if !self.point_equal(op_b, point) {
            op = op_b;
            unsafe {
                self.points[op - 1].update(point);
            }
            op_b = self.duplicate(op, is_right_order);
        }

        (op, op_b, is_right_order)
    }

    fn get_discarded(&self, index: usize, is_right: bool, pt: &Point<i32>) -> bool {
        if self.next(index) == UNASSIGNED {
            return false;
        }

        let next = self.next(index) ;
        let next_x = self.point_x(next);
        let curr_x = self.point_x(index);
        let next_y = self.point_y(next);

        if is_right {
            next_x <= pt.x && next_x >= curr_x && next_y == pt.y
        } else {
            next_x >= pt.x && next_x <= curr_x && next_y == pt.y
        }
    }

    fn get_direction(&self, index1: usize, index2: usize) -> Direction {
        if self.point_x(index1) > self.point_x(index2) {
            Direction::Left
        } else {
            Direction::Right
        }
    }

    fn get_distance(&self, input_index: usize, is_next: bool) -> f64 {
        let mut index = self.get_neighboar_index(input_index, is_next);
        if index == UNASSIGNED {
            return f64::NAN;
        }

        while self.inner_equal(input_index, index ) && index != input_index  {
            index = self.get_neighboar_index(index , is_next);
            if index == UNASSIGNED {
                return f64::NAN;
            }
        }

        let offset_y = self.point_y(index ) - self.point_y(input_index);
        let offset_x = self.point_x(index ) - self.point_x(input_index);
        let result = if offset_y == 0 {
            f64::MIN_POSITIVE
        } else {
            offset_x as f64 / offset_y as f64
        };

        result.abs()
    }

    pub fn point(&self, index: usize) -> &Point<i32> {
        &self.points[index - 1]
    }

    pub fn point_x(&self, index: usize) -> i32 {
        self.points[index - 1].x
    }

    pub fn point_y(&self, index: usize) -> i32 {
        self.points[index - 1].y
    }

    fn create_out_pt(&mut self, x: i32, y: i32) -> usize {
        self.points.push(Point::<i32>::new(Some(x), Some(y)));
        self.point_neighboars.push([UNASSIGNED, UNASSIGNED]);
        self.points.len()
    }

    fn duplicate(&mut self, index: usize, is_insert_after: bool) -> usize {
        let result = self.create_out_pt(self.point_x(index), self.point_y(index));
        if is_insert_after {
            self.push(result, self.next(index) , true);
            self.push(index, result, true);
        } else {
            self.push(self.prev(index) , result, true);
            self.push(result, index, true);
        }
        result
    }

    fn next(&self, index: usize) -> usize {
        self.get_neighboar_index(index, true)
    }

    fn set_next(&mut self, index: usize, value: usize) {
        if index != UNASSIGNED {
            self.point_neighboars[index - 1][1] = value;
        }
    }

    fn prev(&self, index: usize) -> usize {
        self.get_neighboar_index(index, false)
    }

    fn set_prev(&mut self, index: usize, value: usize) {
        if index  != UNASSIGNED {
            self.point_neighboars[index - 1][0] = value;
        }
    }

    fn get_neighboar_index(&self, index: usize, is_next: bool) -> usize {
        if index  == UNASSIGNED {
            return UNASSIGNED;
        }
        let neighboar_index = if is_next { 1 } else { 0 };
        self.point_neighboars[index - 1][neighboar_index]
    }

    fn inner_equal(&self, index1: usize, index2: usize) -> bool {
        unsafe {
            index1  != UNASSIGNED
                && index2  != UNASSIGNED
                && self.points[index1 - 1].almost_equal(&self.points[index2 - 1], None)
        }
    }

    pub fn point_equal(&self, index: usize, point: &Point<i32>) -> bool {
        unsafe { self.points[index - 1].almost_equal(point, None) }
    }

    fn push(&mut self, out_pt1_index: usize, out_pt2_index: usize, is_reverse: bool) {
        if is_reverse {
            self.set_next(out_pt1_index, out_pt2_index );
            self.set_prev(out_pt2_index, out_pt1_index );
        } else {
            self.set_prev(out_pt1_index, out_pt2_index );
            self.set_next(out_pt2_index, out_pt1_index );
        }
    }

    pub fn from_point(&mut self, point: &Point<i32>) -> usize {
        let index = self.create_out_pt(point.x, point.y);
        self.push(index, index, true);
        index
    }

    pub fn join_polys(
        &mut self,
        first_rec_index: usize,
        second_rec_index: usize,
        first_side: Direction,
        second_side: Direction,
    ) {
        let hole_state_rec = self.get_hole_state_rec(first_rec_index, second_rec_index);
        self.join(first_rec_index, second_rec_index, first_side, second_side);

        if hole_state_rec == second_rec_index {
            if self.first_left_index(second_rec_index) != first_rec_index  {
                self.set_first_left_index(first_rec_index, self.first_left_index(second_rec_index));
            }
            self.set_hole(first_rec_index, self.is_hole(second_rec_index));
        }

        self.set_point_index(second_rec_index, UNASSIGNED);
        self.set_first_left_index(second_rec_index, first_rec_index );
        self.set_current_index(second_rec_index, first_rec_index);
    }

    pub fn join_polys2(&mut self, out_rec1: usize, out_rec2: usize) {
        let hole_state_rec = self.get_hole_state_rec(out_rec1, out_rec2);
        self.set_point_index(out_rec2, UNASSIGNED);
        self.set_current_index(out_rec2, out_rec1);
        self.set_hole(out_rec1, self.is_hole(hole_state_rec));

        if hole_state_rec == out_rec2 {
            self.set_first_left_index(out_rec1, self.first_left_index(out_rec2));
        }

        self.set_first_left_index(out_rec2, out_rec1 );
    }

    pub fn split_polys(
        &mut self,
        out_rec1: usize,
        out_pt1_index: usize,
        out_pt2_index: usize,
    ) -> usize {
        self.set_point_index(out_rec1, out_pt1_index);
        let out_rec2 = self.create(out_pt2_index);
        self.post_init(out_rec2);
        out_rec2
    }

    pub fn get_overlap(
        &self,
        op1_index: usize,
        op1b_index: usize,
        op2_index: usize,
        op2b_index: usize,
    ) -> (i32, i32) {
        let a1 = self.point_x(op1_index);
        let a2 = self.point_x(op1b_index);
        let b1 = self.point_x(op2_index);
        let b2 = self.point_x(op2b_index);

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

    pub fn horizontal_join_points(
        &mut self,
        out_hash1: u32,
        out_hash2: u32,
        off_point: &Point<i32>,
    ) -> (u32, u32, bool) {
        let default_result = (out_hash1, out_hash2, false);
        let index1 = get_u16(out_hash1, 0) as usize;
        let index2 = get_u16(out_hash2, 0) as usize;
        let out_pt1_index = get_u16(out_hash1, 1) as usize;
        let out_pt2_index = get_u16(out_hash2, 1) as usize;

        if self.point_equal(out_pt1_index, off_point) && self.point_equal(out_pt2_index, off_point)
        {
            let reverse1 = self.strictly_simple_join(out_pt1_index, off_point);
            let reverse2 = self.strictly_simple_join(out_pt2_index, off_point);

            if reverse1 == reverse2 {
                return default_result;
            }

            return (
                out_hash1,
                join_u16(
                    index2 as u16,
                    self.apply_join(out_pt1_index, out_pt2_index, reverse1) as u16,
                ),
                true,
            );
        }

        let (op1_index, op1b_index) =
            self.flat_horizontal(out_pt1_index, out_pt2_index, out_pt2_index);
        if op1_index == UNASSIGNED || op1b_index == UNASSIGNED {
            return default_result;
        }

        let (op2_index, op2b_index) =
            self.flat_horizontal(out_pt2_index, op1_index , op1b_index );
        if op2_index == UNASSIGNED || op2b_index == UNASSIGNED {
            return default_result;
        }

        let (left_bound, right_bound) = self.get_overlap(
            op1_index ,
            op1b_index ,
            op2_index ,
            op2b_index ,
        );
        let is_overlapped = left_bound < right_bound;

        if !is_overlapped {
            return default_result;
        }

        (
            join_u16(index1 as u16, op1_index as u16),
            join_u16(index2 as u16, op2_index as u16),
            self.join_horz(
                op1_index ,
                op1b_index ,
                op2_index ,
                op2b_index ,
                left_bound,
                right_bound,
            ),
        )
    }
}
