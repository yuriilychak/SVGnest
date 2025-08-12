use crate::{
    geometry::point::Point,
    utils::math::{cycle_index, slopes_equal},
};

use super::{
    constants::UNASSIGNED,
    enums::{ClipType, Direction, EdgePoint, PolyFillType, PolyType},
};

pub struct TEdge {
    is_use_full_range: bool,
    edge_data: Vec<[usize; 8]>,
    wind: Vec<[i32; 3]>,
    dx: Vec<f64>,
    poly_type: Vec<PolyType>,
    side: Vec<Direction>,
    points: Vec<[Point<i32>; 4]>,
    clip_type: ClipType,
    fill_type: PolyFillType,
    pub active: usize,
    pub sorted: usize,
}

impl TEdge {
    pub fn new() -> Self {
        Self {
            is_use_full_range: true,
            edge_data: Vec::new(),
            wind: Vec::new(),
            dx: Vec::new(),
            poly_type: Vec::new(),
            side: Vec::new(),
            points: Vec::new(),
            clip_type: ClipType::Union,
            fill_type: PolyFillType::NonZero,
            active: UNASSIGNED,
            sorted: UNASSIGNED,
        }
    }

    pub fn init(&mut self, clip_type: ClipType, fill_type: PolyFillType) {
        self.clip_type = clip_type;
        self.fill_type = fill_type;
    }

    fn slopes_equal_inner(
        &mut self,
        prev_index: usize,
        curr_index: usize,
        next_index: usize,
    ) -> bool {
        let index = EdgePoint::Curr as usize;
        unsafe {
            Point::slopes_equal(
                &self.points[prev_index - 1][index],
                &self.points[curr_index - 1][index],
                &self.points[next_index - 1][index],
                self.is_use_full_range,
            )
        }
    }

    pub fn create_path(&mut self, polygon: &[Point<i32>], poly_type: PolyType) -> usize {
        let mut last_index = polygon.len() - 1;

        unsafe {
            while last_index > 0
                && (polygon[last_index].almost_equal(&polygon[0], None)
                    || polygon[last_index].almost_equal(&polygon[last_index - 1], None))
            {
                last_index -= 1;
            }
        }

        if last_index < 2 {
            return UNASSIGNED;
        }

        let mut indices: Vec<usize> = Vec::new();
        for i in 0..=last_index {
            indices.push(self.dx.len() + 1);
            self.is_use_full_range = polygon[i].range_test(self.is_use_full_range);
            self.edge_data.push([UNASSIGNED; 8]);
            self.dx.push(0.0);
            self.wind.push([0, 0, 0]);
            self.poly_type.push(poly_type);
            self.side.push(Direction::Left);
            self.points.push([
                Point::<i32>::from(&polygon[i]),
                Point::<i32>::new(None, None),
                Point::<i32>::new(None, None),
                Point::<i32>::new(None, None),
            ]);
        }

        let mut changed = true;
        while changed && indices.len() > 2 {
            changed = false;
            for i in 0..indices.len() {
                let curr_index = indices[i];
                let next_index = indices[cycle_index(i, indices.len(), 1)];
                let prev_index = indices[cycle_index(i, indices.len(), -1)];

                if self.equal(curr_index, next_index, EdgePoint::Curr, EdgePoint::Curr) {
                    if indices.len() <= 3 {
                        break;
                    }
                    indices.remove(i);
                    changed = true;
                    break;
                }

                if self.slopes_equal_inner(prev_index, curr_index, next_index) {
                    if indices.len() <= 3 {
                        break;
                    }
                    indices.remove(i);
                    changed = true;
                    break;
                }
            }
        }

        if indices.len() < 3 {
            return UNASSIGNED;
        }

        let mut is_flat = true;
        let start_y = self.curr(indices[0]).y;
        let edge_count = indices.len();

        for i in 0..edge_count {
            let curr_index = indices[i];
            let next_index = indices[cycle_index(i, indices.len(), 1)];

            if self.curr(curr_index).y >= self.curr(next_index).y {
                self.update(curr_index, curr_index, EdgePoint::Bot, EdgePoint::Curr);
                self.update(curr_index, next_index, EdgePoint::Top, EdgePoint::Curr);
            } else {
                self.update(curr_index, curr_index, EdgePoint::Top, EdgePoint::Curr);
                self.update(curr_index, next_index, EdgePoint::Bot, EdgePoint::Curr);
            }

            self.update(curr_index, curr_index, EdgePoint::Delta, EdgePoint::Top);
            self.sub(curr_index, curr_index, EdgePoint::Delta, EdgePoint::Bot);

            self.dx[curr_index - 1] = if self.delta(curr_index).y == 0 {
                f64::MIN
            } else {
                self.delta(curr_index).x as f64 / self.delta(curr_index).y as f64
            };

            if is_flat && self.curr(curr_index).y != start_y {
                is_flat = false;
            }

            self.set_data_index(curr_index, 0, indices[cycle_index(i, indices.len(), -1)]);
            self.set_data_index(curr_index, 1, indices[cycle_index(i, indices.len(), 1)]);
        }

        if is_flat {
            UNASSIGNED
        } else {
            indices[0]
        }
    }

    pub fn curr(&mut self, index: usize) -> &mut Point<i32> {
        &mut self.points[index - 1][0]
    }

    pub fn bot(&mut self, index: usize) -> &mut Point<i32> {
        &mut self.points[index - 1][1]
    }

    pub fn top(&mut self, index: usize) -> &mut Point<i32> {
        &mut self.points[index - 1][2]
    }

    pub fn point_pair_mut_ref(
        &mut self,
        i1: usize,
        i2: usize,
        p1: usize,
        p2: usize,
    ) -> (&mut Point<i32>, &Point<i32>) {
        if i1 == i2 {
            if p1 == p2 {
                panic!("Same point can't be paired");
            }

            if p1 < p2 {
                let (left, right) = self.points[i1 - 1].split_at_mut(p2);
                (&mut left[p1], &right[0])
            } else {
                let (left, right) = self.points[i1 - 1].split_at_mut(p1);
                (&mut right[0], &left[p2])
            }
        } else {
            if i1 < i2 {
                let (top, bottom) = self.points.split_at_mut(i2 - 1);
                (&mut top[i1 - 1][p1], &bottom[0][p2])
            } else {
                let (top, bottom) = self.points.split_at_mut(i1 - 1);
                (&mut bottom[0][p1], &top[i2 - 1][p2])
            }
        }
    }

    pub fn update(&mut self, index1: usize, index2: usize, p1: EdgePoint, p2: EdgePoint) {
        let (lhs, rhs) = self.point_pair_mut_ref(index1, index2, p1 as usize, p2 as usize);

        unsafe {
            lhs.update(rhs);
        }
    }

    pub fn sub(&mut self, index1: usize, index2: usize, p1: EdgePoint, p2: EdgePoint) {
        let (lhs, rhs) = self.point_pair_mut_ref(index1, index2, p1 as usize, p2 as usize);

        unsafe {
            lhs.sub(rhs);
        }
    }

    pub fn equal(&mut self, index1: usize, index2: usize, p1: EdgePoint, p2: EdgePoint) -> bool {
        unsafe {
            self.points[index1 - 1][p1 as usize].almost_equal(&self.points[index2 - 1][p2 as usize], None)
        }
    }

    pub fn dispose(&mut self) {
        self.edge_data.clear();
        self.wind.clear();
        self.dx.clear();
        self.poly_type.clear();
        self.side.clear();
        self.points.clear();
    }

    pub fn side(&self, index: usize) -> Direction {
        self.side[index - 1]
    }

    pub fn create_local_minima(&mut self, edge_index: usize) -> (i32, usize, usize) {
        let prev_index = self.prev(edge_index);
        let is_clockwise = self.get_clockwise(edge_index);
        let y = self.bot(edge_index).y;
        let left_bound_index = if is_clockwise { edge_index } else { prev_index };
        let right_bound_index = if is_clockwise { prev_index } else { edge_index };

        self.set_side(left_bound_index, Direction::Left);
        self.set_side(right_bound_index, Direction::Right);
        let wind_delta = if self.next(left_bound_index) == right_bound_index {
            -1
        } else {
            1
        };
        self.set_wind_delta(left_bound_index, wind_delta);
        self.set_wind_delta(right_bound_index, -wind_delta);

        (y, left_bound_index, right_bound_index)
    }

    pub fn dx(&self, index: usize) -> f64 {
        self.dx[index - 1]
    }

    pub fn find_next_loc_min(&mut self, index: usize) -> usize {
        let mut result = index;
        loop {
            let mut prev_index = self.prev(result);
            while !self.equal(result, prev_index, EdgePoint::Bot, EdgePoint::Bot)
                || self.equal(result, result, EdgePoint::Curr, EdgePoint::Top)
            {
                result = self.next(result);
                prev_index = self.prev(result);
            }

            if !self.is_dx_horizontal(result) && !self.is_dx_horizontal(prev_index) {
                break;
            }

            while self.is_dx_horizontal(prev_index) {
                result = self.prev(result);
                prev_index = self.prev(result);
            }

            let edge_index = result;
            while self.is_dx_horizontal(result) {
                result = self.next(result);
            }
            prev_index = self.prev(result);

            if self.top(result).y == self.bot(prev_index).y {
                continue;
            }

            prev_index = self.prev(edge_index);
            if self.bot(prev_index).x < self.bot(result).x {
                result = edge_index;
            }
            break;
        }
        result
    }

    pub fn maxima_pair(&mut self, edge1_index: usize) -> usize {
        let mut result = UNASSIGNED;
        if self.check_max_pair(edge1_index, true) {
            result = self.next(edge1_index);
        } else if self.check_max_pair(edge1_index, false) {
            result = self.prev(edge1_index);
        }

        if result == UNASSIGNED
            || (self.next_active(result) == self.prev_active(result) && !self.is_horizontal(result))
        {
            UNASSIGNED
        } else {
            result
        }
    }

    pub fn has_next_local_minima(&self, index: usize) -> bool {
        self.get_next_local_minima(index) != UNASSIGNED
    }

    pub fn horz_direction(&mut self, index: usize) -> (Direction, i32, i32) {
        if self.bot(index).x < self.top(index).x {
            (Direction::Right, self.bot(index).x, self.top(index).x)
        } else {
            (Direction::Left, self.top(index).x, self.bot(index).x)
        }
    }

    pub fn get_stop(&mut self, index: usize, point: &Point<i32>, is_protect: bool) -> bool {
        if is_protect || self.has_next_local_minima(index) {
            return false;
        }
        unsafe { self.top(index).almost_equal(point, None) }
    }

    pub fn get_intermediate(&mut self, index: usize, y: i32) -> bool {
        if !self.has_next_local_minima(index) {
            return false;
        }
        self.top(index).y == y
    }

    pub fn get_maxima(&mut self, index: usize, y: i32) -> bool {
        if self.has_next_local_minima(index) {
            return false;
        }
        self.top(index).y == y
    }

    pub fn swap_sides_and_indeces(&mut self, edge1_index: usize, edge2_index: usize) {
        let rec1_index = self.get_rec_index(edge1_index);
        let rec2_index = self.get_rec_index(edge2_index);
        self.set_rec_index(edge1_index, rec2_index);
        self.set_rec_index(edge2_index, rec1_index);
        self.swap_sides(edge1_index, edge2_index);
    }

    pub fn get_hole_state(&self, first_left_index: usize, edge_index: usize) -> (bool, usize) {
        let mut is_hole = false;
        let mut current_index = self.prev_active(edge_index);
        let mut index = UNASSIGNED;

        while current_index != UNASSIGNED {
            if self.is_assigned(current_index) && !self.is_wind_deleta_empty(current_index) {
                is_hole = !is_hole;
                if first_left_index == UNASSIGNED {
                    index = self.get_rec_index(current_index);
                }
            }
            current_index = self.prev_active(current_index);
        }
        (is_hole, index)
    }

    pub fn swap_edges(
        &mut self,
        e1_wc: i32,
        e2_wc: i32,
        edge1_index: usize,
        edge2_index: usize,
    ) -> bool {
        let e1_wc2;
        let e2_wc2;

        match self.fill_type {
            PolyFillType::Positive => {
                e1_wc2 = self.wind_count2(edge1_index);
                e2_wc2 = self.wind_count2(edge2_index);
            }
            PolyFillType::Negative => {
                e1_wc2 = -self.wind_count2(edge1_index);
                e2_wc2 = -self.wind_count2(edge2_index);
            }
            _ => {
                e1_wc2 = self.wind_count2(edge1_index).abs();
                e2_wc2 = self.wind_count2(edge2_index).abs();
            }
        }

        if !self.is_same_poly_type(edge1_index, edge2_index) {
            return true;
        }

        if e1_wc == 1 && e2_wc == 1 {
            match self.clip_type {
                ClipType::Union => return e1_wc2 <= 0 && e2_wc2 <= 0,
                ClipType::Difference => {
                    return (self.poly_type[edge1_index - 1] == PolyType::Clip
                        && e1_wc2.min(e2_wc2) > 0)
                        || (self.poly_type[edge1_index - 1] == PolyType::Subject
                            && e1_wc2.max(e2_wc2) <= 0)
                }
                _ => return false,
            }
        }

        self.swap_sides(edge1_index, edge2_index);
        false
    }

    pub fn can_join_left(&mut self, index: usize) -> bool {
        if !self.is_filled(index) || self.prev_active(index) == UNASSIGNED {
            return false;
        }
        let prev_index = self.prev_active(index);
        self.curr(prev_index).x == self.bot(index).x
            && self.is_filled(prev_index)
            && self.slopes_equal(self.prev_active(index), index)
    }

    pub fn can_join_right(&mut self, index: usize) -> bool {
        if !self.is_filled(index) || self.prev_active(index) == UNASSIGNED {
            return false;
        }
        let prev_index = self.prev_active(index);
        self.is_filled(prev_index) && self.slopes_equal(prev_index, index)
    }

    pub fn can_add_scanbeam(&mut self, index: usize) -> bool {
        if !self.is_filled(index) || self.prev_active(index) == UNASSIGNED {
            return false;
        }
        let prev_index = self.prev_active(index);
        self.is_filled(prev_index) && self.curr(prev_index).x == self.curr(index).x
    }

    pub fn next_active(&self, index: usize) -> usize {
        self.next_neighboar(index, true)
    }

    pub fn prev_active(&self, index: usize) -> usize {
        self.prev_neighboar(index, true)
    }

    pub fn next_sorted(&self, index: usize) -> usize {
        self.next_neighboar(index, false)
    }

    pub fn prev_sorted(&self, index: usize) -> usize {
        self.prev_neighboar(index, false)
    }

    pub fn set_next_active(&mut self, index: usize, value: usize) {
        self.set_neighboar(index, true, true, value);
    }

    pub fn get_next_local_minima(&self, index: usize) -> usize {
        self.get_data_index(index, 6)
    }

    pub fn get_rec_index(&self, index: usize) -> usize {
        self.get_data_index(index, 7)
    }

    pub fn set_rec_index(&mut self, index: usize, value: usize) {
        self.set_data_index(index, 7, value);
    }

    pub fn get_neighboar(&self, edge_index: usize, is_next: bool, is_ael: bool) -> usize {
        let data_index = self.get_neighboar_index(is_next, is_ael);
        self.get_data_index(edge_index, data_index)
    }

    pub fn set_neighboar(&mut self, edge_index: usize, is_next: bool, is_ael: bool, value: usize) {
        let data_index = self.get_neighboar_index(is_next, is_ael);
        self.set_data_index(edge_index, data_index, value);
    }

    pub fn is_neighboar(&self, index1: usize, index2: usize, is_ael: bool) -> bool {
        self.get_neighboar(index1, true, is_ael) == index2
            || self.get_neighboar(index1, false, is_ael) == index2
    }

    pub fn add_edge_to_sel(&mut self, index: usize) {
        self.set_neighboar(index, false, false, UNASSIGNED);
        self.set_neighboar(index, true, false, self.sorted);
        if self.sorted != UNASSIGNED {
            self.set_neighboar(self.sorted, false, false, index);
        }
        self.sorted = index;
    }

    pub fn is_same_poly_type(&self, index1: usize, index2: usize) -> bool {
        self.poly_type[index1 - 1] == self.poly_type[index2 - 1]
    }

    pub fn align_wnd_count(&mut self, index1: usize, index2: usize) {
        let edge1_wind_delta = self.wind_delta(index1);
        let edge2_wind_delta = self.wind_delta(index2);

        if self.is_same_poly_type(index1, index2) {
            let edge1_wind_count1 = self.wind_count1(index1);
            let edge2_wind_count1 = self.wind_count1(index2);
            self.set_wind_count1(
                index1,
                if edge1_wind_count1 == -edge2_wind_delta {
                    -edge1_wind_count1
                } else {
                    edge1_wind_count1 + edge2_wind_delta
                },
            );
            self.set_wind_count1(
                index2,
                if edge2_wind_count1 == edge1_wind_delta {
                    -edge2_wind_count1
                } else {
                    edge2_wind_count1 - edge1_wind_delta
                },
            );
        } else {
            let edge1_wind_count2 = self.wind_count2(index1);
            let edge2_wind_count2 = self.wind_count2(index2);
            self.set_wind_count2(index1, edge1_wind_count2 + edge2_wind_delta);
            self.set_wind_count2(index2, edge2_wind_count2 - edge1_wind_delta);
        }
    }

    pub fn check_horizontal_condition(&mut self, index: usize, is_next: bool) -> bool {
        let neighboar_index = self.get_neighboar(index, is_next, true);
        if neighboar_index == UNASSIGNED || !self.slopes_equal(index, neighboar_index) {
            return false;
        }

        self.equal(neighboar_index, index, EdgePoint::Curr, EdgePoint::Bot)
            && self.is_filled(neighboar_index)
            && self.curr(neighboar_index).y > self.top(neighboar_index).y
    }

    pub fn check_shared_condition(&mut self, index: usize, out_hash: usize, is_next: bool) -> bool {
        out_hash != UNASSIGNED
            && self.check_horizontal_condition(index, is_next)
            && !self.is_wind_deleta_empty(index)
    }

    pub fn copy_ael_to_sel(&mut self) {
        self.sorted = self.active;
        let mut current_index = self.active;
        while current_index != UNASSIGNED {
            current_index = self.copy_active_to_sorted(current_index);
        }
    }

    pub fn swap_positions_in_list(&mut self, edge_index1: usize, edge_index2: usize, is_ael: bool) {
        let mut edge_index = UNASSIGNED;
        if self.get_swap_position_in_el(edge_index1, edge_index2, is_ael) {
            if self.prev_neighboar(edge_index1, is_ael) == UNASSIGNED {
                edge_index = edge_index1;
            } else if self.prev_neighboar(edge_index2, is_ael) == UNASSIGNED {
                edge_index = edge_index2;
            }
        }
        if edge_index != UNASSIGNED {
            self.set_current_edge(edge_index, is_ael);
        }
    }

    pub fn delete_from_list(&mut self, edge_index: usize, is_ael: bool) {
        let next_index = self.next_neighboar(edge_index, is_ael);
        let prev_index = self.prev_neighboar(edge_index, is_ael);
        let has_next = next_index != UNASSIGNED;
        let has_prev = prev_index != UNASSIGNED;

        if !has_prev && !has_next && edge_index != self.get_current_edge(is_ael) {
            return;
        }

        if has_prev {
            self.set_neighboar(prev_index, true, is_ael, next_index);
        } else {
            self.set_current_edge(next_index, is_ael);
        }

        if has_next {
            self.set_neighboar(next_index, false, is_ael, prev_index);
        }

        self.set_neighboar(edge_index, true, is_ael, UNASSIGNED);
        self.set_neighboar(edge_index, false, is_ael, UNASSIGNED);
    }

    pub fn is_use_full_range(&self) -> bool {
        self.is_use_full_range
    }

    pub fn check_reverse(&mut self, p1: &Point<i32>, p2: &Point<i32>, p3: &Point<i32>) -> bool {
        unsafe { p2.y > p1.y || !Point::slopes_equal(p1, p2, p3, self.is_use_full_range) }
    }

    pub fn reset(&mut self) {
        self.active = UNASSIGNED;
        self.sorted = UNASSIGNED;
    }

    pub fn prepare_for_intersections(&mut self, top_y: i32) -> bool {
        if self.active == UNASSIGNED {
            return false;
        }
        self.sorted = self.active;
        let mut edge_index = self.active;
        while edge_index != UNASSIGNED {
            let idx = edge_index;
            self.curr(idx).x = self.get_top_x(idx, top_y);
            edge_index = self.copy_active_to_sorted(idx);
        }
        true
    }

    pub fn get_last_horizontal(&mut self, index: usize) -> usize {
        let mut result = index;
        while self.has_next_local_minima(result)
            && self.is_horizontal(self.get_next_local_minima(result))
        {
            result = self.get_next_local_minima(result);
        }
        result
    }

    pub fn get_max_pair(&mut self, index: usize) -> usize {
        if self.has_next_local_minima(index) {
            UNASSIGNED
        } else {
            self.maxima_pair(index)
        }
    }

    pub fn process_bounds(&mut self, index: usize, left_bound: usize, right_bound: usize) -> usize {
        let is_clockwise = self.get_clockwise(index);
        let curr_index = self.process_bound(left_bound, is_clockwise);
        let next_index = self.process_bound(right_bound, !is_clockwise);
        if is_clockwise {
            curr_index
        } else {
            next_index
        }
    }

    pub fn update_edge_into_ael(&mut self, edge_index: usize) -> usize {
        let curr_index = self.get_next_local_minima(edge_index);
        let prev_index = self.prev_active(edge_index);
        let next_index = self.next_active(edge_index);

        self.set_rec_index(curr_index, self.get_rec_index(edge_index));

        if prev_index != UNASSIGNED {
            self.set_next_active(prev_index, curr_index);
        } else {
            self.active = curr_index;
        }

        if next_index != UNASSIGNED {
            self.set_prev_active(next_index, curr_index);
        }

        self.update_current(curr_index, edge_index);
        curr_index
    }

    pub fn reset_bounds(&mut self, left_index: usize, right_index: usize) {
        self.reset_bound(left_index, Direction::Left);
        self.reset_bound(right_index, Direction::Right);
    }

    pub fn get_wnd_type_filled(&self, index: usize) -> i32 {
        let wind_count1 = self.wind_count1(index);
        match self.fill_type {
            PolyFillType::Positive => wind_count1,
            PolyFillType::Negative => -wind_count1,
            _ => wind_count1.abs(),
        }
    }

    pub fn is_filled(&self, index: usize) -> bool {
        self.is_assigned(index) && !self.is_wind_deleta_empty(index)
    }

    pub fn curr_from_top_x(&mut self, index: usize, y: i32) {
        let x = self.get_top_x(index, y);
        unsafe {
            self.curr(index).set(x, y);
        }
    }

    pub fn is_assigned(&self, index: usize) -> bool {
        self.get_rec_index(index) != UNASSIGNED
    }

    pub fn is_horizontal(&mut self, index: usize) -> bool {
        self.delta(index).y == 0
    }

    pub fn is_wind_deleta_empty(&self, index: usize) -> bool {
        self.wind_delta(index) == 0
    }

    pub fn unassign(&mut self, index: usize) {
        self.set_rec_index(index, UNASSIGNED);
    }

    pub fn get_intersect_x(&mut self, curr_index: usize, next_index: usize, bot_y: i32) -> i32 {
        let index = if self.dx(curr_index).abs() > self.dx(next_index).abs() {
            next_index
        } else {
            curr_index
        };
        self.get_top_x(index, bot_y)
    }

    pub fn get_intersect_error(
        &mut self,
        curr_index: usize,
        next_index: usize,
        point: &mut Point<i32>,
    ) -> bool {
        !self.intersect_point(curr_index, next_index, point)
            && self.curr(curr_index).x > self.curr(next_index).x + 1
    }

    pub fn intersect_line_with_poly(&self, edge1_index: usize, edge2_index: usize) -> bool {
        self.is_same_poly_type(edge1_index, edge2_index)
            && self.wind_delta(edge1_index) != self.wind_delta(edge2_index)
            && self.clip_type == ClipType::Union
    }

    pub fn intersect_line(&self, edge1_index: usize, edge2_index: usize) -> bool {
        self.is_wind_deleta_empty(edge1_index)
            && self.wind_count1(edge2_index).abs() == 1
            && (self.clip_type != ClipType::Union || self.wind_count2(edge2_index) == 0)
    }

    pub fn is_intermediate_horizontal_end(&mut self, curr_index: usize, horz_index: usize) -> bool {
        self.curr(curr_index).x == self.top(horz_index).x
            && self.has_next_local_minima(horz_index)
            && self.dx(curr_index) < self.dx(self.get_next_local_minima(horz_index))
    }

    pub fn insert_local_minima_into_ael(
        &mut self,
        left_bound_index: usize,
        right_bound_index: usize,
    ) -> bool {
        if left_bound_index == UNASSIGNED {
            self.insert_edge_into_ael(right_bound_index, UNASSIGNED);
            self.set_winding_count(right_bound_index);
            return self.get_contributing(right_bound_index);
        }

        if right_bound_index == UNASSIGNED {
            self.insert_edge_into_ael(left_bound_index, UNASSIGNED);
            self.set_winding_count(left_bound_index);
            return self.get_contributing(left_bound_index);
        }

        self.insert_edge_into_ael(left_bound_index, UNASSIGNED);
        self.insert_edge_into_ael(right_bound_index, left_bound_index);
        self.set_winding_count(left_bound_index);
        self.set_wind_count1(right_bound_index, self.wind_count1(left_bound_index));
        self.set_wind_count2(right_bound_index, self.wind_count2(left_bound_index));

        self.get_contributing(left_bound_index)
    }

    pub fn add_local_min_poly(
        &mut self,
        index1: usize,
        index2: usize,
        point: &Point<i32>,
    ) -> (bool, usize, Point<i32>) {
        self.set_rec_index(index2, self.get_rec_index(index1));
        self.set_side(index2, Direction::Right);
        self.set_side(index1, Direction::Left);

        let prev_neighboar = if self.prev_active(index1) == index2 {
            index2
        } else {
            index1
        };
        let prev_index = self.prev_active(prev_neighboar);
        let condition = self.check_min_join(index1, prev_index, point);
        let top = Point::<i32>::from(self.top(index1));

        (condition, prev_index, top)
    }

    pub fn add_local_max_poly(&mut self, first_index: usize, second_index: usize) {
        let first_side = self.side(first_index);
        let ok_idx = self.get_rec_index(first_index);
        let obsolete_idx = self.get_rec_index(second_index);
        self.unassign(first_index);
        self.unassign(second_index);
        self.update_index_ael(first_side, obsolete_idx, ok_idx);
    }

    pub fn delete_intersect_asignment(&mut self, index: usize) {
        if !self.is_assigned(index) {
            self.delete_from_list(index, true);
        } else {
            // showError('Error intersecting polylines');
        }
    }

    pub fn get_stopped(&mut self, index: usize, point: &Point<i32>, is_protect: bool) -> bool {
        unsafe {
            !is_protect
                && !self.has_next_local_minima(index)
                && self.top(index).almost_equal(point, None)
        }
    }

    fn reset_bound(&mut self, index: usize, side: Direction) {
        if index == UNASSIGNED {
            return;
        }
        let idx = index;
        self.update(idx, idx, EdgePoint::Curr, EdgePoint::Bot);
        self.set_side(idx, side);
        self.set_rec_index(idx, UNASSIGNED);
    }

    fn get_top_x(&mut self, index: usize, y: i32) -> i32 {
        if y == self.top(index).y {
            self.top(index).x
        } else {
            self.bot(index).x + (self.dx(index) * (y - self.bot(index).y) as f64).round() as i32
        }
    }

    fn get_contributing(&self, index: usize) -> bool {
        let is_reverse =
            self.clip_type == ClipType::Difference && self.poly_type[index - 1] == PolyType::Clip;
        let wind_count1 = self.wind_count1(index);
        let wind_count2 = self.wind_count2(index);

        match self.fill_type {
            PolyFillType::NonZero => wind_count1.abs() == 1 && is_reverse != (wind_count2 == 0),
            PolyFillType::Positive => wind_count1 == 1 && is_reverse != (wind_count2 <= 0),
            _ => wind_count1 == UNASSIGNED as i32 && is_reverse != (wind_count2 >= 0),
        }
    }

    fn delta(&mut self, index: usize) -> &mut Point<i32> {
        &mut self.points[index][3]
    }

    fn set_side(&mut self, index: usize, value: Direction) {
        if self.get_index_valid(index) {
            self.side[index - 1] = value;
        } else {
            // showError(`TEdgeController.setSide: index ${index} is out of bounds`);
        }
    }

    fn get_clockwise(&self, index: usize) -> bool {
        self.dx(index) >= self.dx(self.prev(index))
    }

    fn is_dx_horizontal(&self, index: usize) -> bool {
        self.dx(index) == f64::MIN
    }

    fn process_bound(&mut self, index: usize, is_clockwise: bool) -> usize {
        if self.is_dx_horizontal(index) {
            let neighboar_index = self.base_neighboar(index, !is_clockwise);
            if self.bot(index).x != self.bot(neighboar_index).x {
                self.reverse_horizontal(index);
            }
        }

        let mut neighboar_index = self.base_neighboar(index, is_clockwise);
        let mut result_index = index;

        while self.top(result_index).y == self.bot(neighboar_index).y {
            result_index = neighboar_index;
            neighboar_index = self.base_neighboar(neighboar_index, is_clockwise);
        }

        if self.is_dx_horizontal(result_index) {
            let mut horz_neighboar_index = self.base_neighboar(result_index, !is_clockwise);
            while self.is_dx_horizontal(horz_neighboar_index) {
                horz_neighboar_index = self.base_neighboar(horz_neighboar_index, !is_clockwise);
            }

            let curr_neighboar_index = self.base_neighboar(result_index, is_clockwise);
            if (self.top(horz_neighboar_index).x == self.top(curr_neighboar_index).x
                && !is_clockwise)
                || self.top(horz_neighboar_index).x > self.top(curr_neighboar_index).x
            {
                result_index = horz_neighboar_index;
            }
        }

        let mut edge_index = index;
        while edge_index != result_index {
            let local_minima = self.base_neighboar(edge_index, is_clockwise);
            self.set_next_local_minima(edge_index, local_minima);
            if self.check_reverse_horizontal(edge_index, index, !is_clockwise) {
                self.reverse_horizontal(edge_index);
            }
            edge_index = local_minima;
        }

        if self.check_reverse_horizontal(edge_index, index, !is_clockwise) {
            self.reverse_horizontal(edge_index);
        }

        self.base_neighboar(result_index, is_clockwise)
    }

    fn wind_delta(&self, index: usize) -> i32 {
        self.wind[index - 1][0]
    }

    fn set_wind_delta(&mut self, index: usize, value: i32) {
        if self.get_index_valid(index) {
            self.wind[index - 1][0] = value;
        }
    }

    fn wind_count1(&self, index: usize) -> i32 {
        self.wind[index - 1][1]
    }

    fn set_wind_count1(&mut self, index: usize, value: i32) {
        if self.get_index_valid(index) {
            self.wind[index - 1][1] = value;
        }
    }

    fn wind_count2(&self, index: usize) -> i32 {
        self.wind[index - 1][2]
    }

    fn set_wind_count2(&mut self, index: usize, value: i32) {
        if self.get_index_valid(index) {
            self.wind[index - 1][2] = value;
        }
    }

    fn check_reverse_horizontal(&mut self, edge_index: usize, index: usize, is_next: bool) -> bool {
        if edge_index == index {
            return false;
        }
        let neighboar_index = self.base_neighboar(edge_index, is_next);
        self.is_dx_horizontal(edge_index) && self.bot(edge_index).x != self.top(neighboar_index).x
    }

    fn get_index_valid(&self, index: usize) -> bool {
        index != UNASSIGNED && index < self.dx.len()
    }

    fn next(&self, index: usize) -> usize {
        self.base_neighboar(index, true)
    }

    fn prev(&self, index: usize) -> usize {
        self.base_neighboar(index, false)
    }

    fn check_max_pair(&mut self, edge_index: usize, is_next: bool) -> bool {
        let index = self.base_neighboar(edge_index, is_next);
        if index == UNASSIGNED || self.has_next_local_minima(index) {
            return false;
        }

        self.equal(index, edge_index, EdgePoint::Top, EdgePoint::Top)
    }

    fn swap_sides(&mut self, edge1_index: usize, edge2_index: usize) {
        let side1 = self.side(edge1_index);
        let side2 = self.side(edge2_index);
        self.set_side(edge1_index, side2);
        self.set_side(edge2_index, side1);
    }

    fn update_index_ael(&mut self, side: Direction, old_index: usize, new_index: usize) {
        let mut current_index = self.active;
        while current_index != UNASSIGNED {
            if self.get_rec_index(current_index) == old_index {
                self.set_rec_index(current_index, new_index);
                self.set_side(current_index, side);
                break;
            }
            current_index = self.next_active(current_index);
        }
    }

    fn intersect_point(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        intersect_point: &mut Point<i32>,
    ) -> bool {
        let dx1 = self.dx(edge1_index);
        let dx2 = self.dx(edge2_index);

        if self.slopes_equal(edge1_index, edge2_index) || dx1 == dx2 {
            let point = if self.bot(edge2_index).y > self.bot(edge1_index).y {
                self.bot(edge2_index)
            } else {
                self.bot(edge1_index)
            };
            unsafe {
                intersect_point.update(point);
            }
            return false;
        }

        let intersect_x: i32;
        let intersect_y: i32;

        if self.delta(edge1_index).x == 0 {
            intersect_x = self.bot(edge1_index).x;
            intersect_y = if self.is_horizontal(edge2_index) {
                self.bot(edge2_index).y
            } else {
                ((self.bot(edge1_index).x - self.bot(edge2_index).x) as f64 / dx2
                    + self.bot(edge2_index).y as f64)
                    .round() as i32
            };
        } else if self.delta(edge2_index).x == 0 {
            intersect_x = self.bot(edge2_index).x;
            intersect_y = if self.is_horizontal(edge1_index) {
                self.bot(edge1_index).y
            } else {
                ((self.bot(edge2_index).x - self.bot(edge1_index).x) as f64 / dx1
                    + self.bot(edge1_index).y as f64)
                    .round() as i32
            };
        } else {
            let b1 = self.bot(edge1_index).x as f64 - self.bot(edge1_index).y as f64 * dx1;
            let b2 = self.bot(edge2_index).x as f64 - self.bot(edge2_index).y as f64 * dx2;
            let q = (b2 - b1) / (dx1 - dx2);

            intersect_x = if dx1.abs() < dx2.abs() {
                (dx1 * q + b1).round() as i32
            } else {
                (dx2 * q + b2).round() as i32
            };
            intersect_y = q.round() as i32;
        }

        unsafe {
            intersect_point.set(intersect_x, intersect_y);
        }

        if intersect_point.y < self.top(edge1_index).y
            || intersect_point.y < self.top(edge2_index).y
        {
            if self.top(edge1_index).y > self.top(edge2_index).y {
                let top_y = self.top(edge1_index).y;
                unsafe {
                    intersect_point
                        .set(self.get_top_x(edge2_index, top_y), self.top(edge1_index).y);
                }
                return intersect_point.x < self.top(edge1_index).x;
            }
            unsafe {
                intersect_point.set(
                    if self.dx(edge1_index).abs() < self.dx(edge2_index).abs() {
                        self.get_top_x(edge1_index, intersect_point.y)
                    } else {
                        self.get_top_x(edge2_index, intersect_point.y)
                    },
                    self.top(edge2_index).y,
                );
            }
        }
        true
    }

    fn next_neighboar(&self, index: usize, is_ael: bool) -> usize {
        self.get_neighboar(index, true, is_ael)
    }

    fn prev_neighboar(&self, index: usize, is_ael: bool) -> usize {
        self.get_neighboar(index, false, is_ael)
    }

    fn reverse_horizontal(&mut self, index: usize) {
        let tmp = self.top(index).x;
        self.top(index).x = self.bot(index).x;
        self.bot(index).x = tmp;
    }

    fn set_prev_active(&mut self, index: usize, value: usize) {
        self.set_neighboar(index, false, true, value);
    }

    fn get_neighboar_index(&self, is_next: bool, is_ael: bool) -> usize {
        let index = if is_next { 2 } else { 3 };
        let offset = if is_ael { 2 } else { 0 };
        index + offset
    }

    fn base_neighboar(&self, index: usize, is_next: bool) -> usize {
        let data_index = if is_next { 1 } else { 0 };
        self.get_data_index(index, data_index)
    }

    fn get_data_index(&self, edge_index: usize, data_index: usize) -> usize {
        if self.get_index_valid(edge_index) {
            self.edge_data[edge_index - 1][data_index]
        } else {
            UNASSIGNED
        }
    }

    fn set_data_index(&mut self, edge_index: usize, data_index: usize, value: usize) {
        if self.get_index_valid(edge_index) {
            self.edge_data[edge_index - 1][data_index] = value;
        }
    }

    fn set_next_local_minima(&mut self, edge_index: usize, minima_index: usize) {
        self.set_data_index(edge_index, 6, minima_index);
    }

    fn get_swap_position_in_el(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        is_ael: bool,
    ) -> bool {
        let next_index1 = self.next_neighboar(edge1_index, is_ael);
        let next_index2 = self.next_neighboar(edge2_index, is_ael);
        let prev_index1 = self.prev_neighboar(edge1_index, is_ael);
        let prev_index2 = self.prev_neighboar(edge2_index, is_ael);
        let is_removed = if is_ael {
            next_index1 == prev_index1 || next_index2 == prev_index2
        } else {
            (next_index1 == UNASSIGNED && prev_index1 == UNASSIGNED)
                || (next_index2 == UNASSIGNED && prev_index2 == UNASSIGNED)
        };

        if is_removed {
            return false;
        }

        if next_index1 == edge2_index {
            if next_index2 != UNASSIGNED {
                self.set_neighboar(next_index2, false, is_ael, edge1_index);
            }
            if prev_index1 != UNASSIGNED {
                self.set_neighboar(prev_index1, true, is_ael, edge2_index);
            }
            self.set_neighboar(edge2_index, false, is_ael, prev_index1);
            self.set_neighboar(edge2_index, true, is_ael, edge1_index);
            self.set_neighboar(edge1_index, false, is_ael, edge2_index);
            self.set_neighboar(edge1_index, true, is_ael, next_index2);
            return true;
        }

        if next_index2 == edge1_index {
            if next_index1 != UNASSIGNED {
                self.set_neighboar(next_index1, false, is_ael, edge2_index);
            }
            if prev_index2 != UNASSIGNED {
                self.set_neighboar(prev_index2, true, is_ael, edge1_index);
            }
            self.set_neighboar(edge1_index, false, is_ael, prev_index2);
            self.set_neighboar(edge1_index, true, is_ael, edge2_index);
            self.set_neighboar(edge2_index, false, is_ael, edge1_index);
            self.set_neighboar(edge2_index, true, is_ael, next_index1);
            return true;
        }

        self.set_neighboar(edge1_index, true, is_ael, next_index2);
        if next_index2 != UNASSIGNED {
            self.set_neighboar(next_index2, false, is_ael, edge1_index);
        }
        self.set_neighboar(edge1_index, false, is_ael, prev_index2);
        if prev_index2 != UNASSIGNED {
            self.set_neighboar(prev_index2, false, is_ael, edge1_index);
        }
        self.set_neighboar(edge2_index, true, is_ael, next_index1);
        if edge1_index != UNASSIGNED {
            self.set_neighboar(next_index1, false, is_ael, edge2_index);
        }
        self.set_neighboar(edge2_index, false, is_ael, prev_index1);
        if prev_index1 != UNASSIGNED {
            self.set_neighboar(prev_index1, true, is_ael, edge2_index);
        }
        true
    }

    fn insert_edge_into_ael(&mut self, index: usize, start_edge_index: usize) {
        if self.active == UNASSIGNED {
            self.set_prev_active(index, UNASSIGNED);
            self.set_next_active(index, UNASSIGNED);
            self.active = index;
            return;
        }

        if start_edge_index == UNASSIGNED && self.inserts_before(index, self.active) {
            self.set_prev_active(index, UNASSIGNED);
            self.set_next_active(index, self.active);
            self.set_neighboar(self.active, false, true, index);
            self.active = index;
            return;
        }

        let mut edge_index = if start_edge_index == UNASSIGNED {
            self.active
        } else {
            start_edge_index
        };
        let mut next_index = self.next_active(edge_index);

        while next_index != UNASSIGNED && !self.inserts_before(index, next_index) {
            edge_index = next_index;
            next_index = self.next_active(edge_index);
        }

        self.set_next_active(index, next_index);
        if next_index != UNASSIGNED {
            self.set_neighboar(next_index, false, true, index);
        }
        self.set_prev_active(index, edge_index);
        self.set_neighboar(edge_index, true, true, index);
    }

    fn set_winding_count(&mut self, index: usize) {
        let mut edge_index = self.prev_active(index);
        while edge_index != UNASSIGNED
            && (!self.is_same_poly_type(edge_index, index) || self.is_wind_deleta_empty(edge_index))
        {
            edge_index = self.prev_active(edge_index);
        }

        if edge_index == UNASSIGNED {
            self.set_wind_count1(
                index,
                if self.is_wind_deleta_empty(index) {
                    1
                } else {
                    self.wind_delta(index)
                },
            );
            self.set_wind_count2(index, 0);
            edge_index = self.active;
        } else if self.is_wind_deleta_empty(index) && self.clip_type != ClipType::Union {
            self.set_wind_count1(index, 1);
            self.set_wind_count2(index, self.wind_count2(edge_index));
            edge_index = self.next_active(edge_index);
        } else {
            let edge_delta = self.wind_delta(edge_index);
            let input_delta = self.wind_delta(index);
            let edge_wind_count1 = self.wind_count1(edge_index);
            let next_wind_count1;

            if edge_wind_count1 * edge_delta < 0 {
                if edge_wind_count1.abs() > 1 {
                    next_wind_count1 = if edge_delta * input_delta < 0 {
                        edge_wind_count1
                    } else {
                        edge_wind_count1 + input_delta
                    };
                } else {
                    next_wind_count1 = if self.is_wind_deleta_empty(index) {
                        1
                    } else {
                        input_delta
                    };
                }
            } else {
                if self.is_wind_deleta_empty(index) {
                    next_wind_count1 = if edge_wind_count1 < 0 {
                        edge_wind_count1 - 1
                    } else {
                        edge_wind_count1 + 1
                    };
                } else {
                    next_wind_count1 = if edge_delta * input_delta < 0 {
                        edge_wind_count1
                    } else {
                        edge_wind_count1 + input_delta
                    };
                }
            }
            self.set_wind_count1(index, next_wind_count1);
            self.set_wind_count2(index, self.wind_count2(edge_index));
            edge_index = self.next_active(edge_index);
        }

        while edge_index != index {
            self.set_wind_count2(index, self.wind_count2(index) + self.wind_delta(edge_index));
            edge_index = self.next_active(edge_index);
        }
    }

    fn inserts_before(&mut self, index1: usize, index2: usize) -> bool {
        let curr_x1 = self.curr(index1).x;
        let curr_x2 = self.curr(index2).x;

        if curr_x1 == curr_x2 {
            let top_x1 = self.top(index1).x;
            let top_x2 = self.top(index2).x;
            let top_y1 = self.top(index1).y;
            let top_y2 = self.top(index2).y;

            if top_y1 > top_y2 {
                top_x1 < self.get_top_x(index2, top_y1)
            } else {
                top_x2 > self.get_top_x(index1, top_y2)
            }
        } else {
            curr_x1 < curr_x2
        }
    }

    fn check_min_join(&mut self, curr_index: usize, prev_index: usize, point: &Point<i32>) -> bool {
        prev_index != UNASSIGNED
            && self.is_filled(prev_index)
            && self.get_top_x(prev_index, point.y) == self.get_top_x(curr_index, point.y)
            && self.slopes_equal(curr_index, prev_index)
            && !self.is_wind_deleta_empty(curr_index)
    }

    fn slopes_equal(&mut self, e1_index: usize, e2_index: usize) -> bool {
        slopes_equal(
            f64::from(self.delta(e1_index).y),
            f64::from(self.delta(e2_index).x),
            f64::from(self.delta(e1_index).x),
            f64::from(self.delta(e2_index).y),
            self.is_use_full_range,
        )
    }

    fn update_current(&mut self, index: usize, edge_index: usize) {
        self.set_side(index, self.side(edge_index));
        self.set_wind_delta(index, self.wind_delta(edge_index));
        self.set_wind_count1(index, self.wind_count1(edge_index));
        self.set_wind_count2(index, self.wind_count2(edge_index));
        self.set_prev_active(index, self.prev_active(edge_index));
        self.set_next_active(index, self.next_active(edge_index));
        self.update(index, index, EdgePoint::Curr, EdgePoint::Bot);
    }

    fn copy_active_to_sorted(&mut self, index: usize) -> usize {
        self.set_neighboar(index, false, false, self.prev_active(index));
        self.set_neighboar(index, true, false, self.next_active(index));
        self.next_active(index)
    }

    fn get_current_edge(&self, is_ael: bool) -> usize {
        if is_ael {
            self.active
        } else {
            self.sorted
        }
    }

    fn set_current_edge(&mut self, value: usize, is_ael: bool) {
        if is_ael {
            self.active = value;
        } else {
            self.sorted = value;
        }
    }
}
