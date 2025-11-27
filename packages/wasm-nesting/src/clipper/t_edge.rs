use crate::clipper::constants::UNASSIGNED;
use crate::clipper::enums::{BoolCondition, ClipType, Direction, EdgeSide, PolyFillType, PolyType};
use crate::clipper::utils::show_error;
use crate::geometry::point::Point;
use crate::utils::math::{cycle_index, slopes_equal};
use crate::utils::round::ClipperRound;
use std::f64;

pub struct TEdge {
    is_use_full_range: bool,
    edge_data: Vec<[u16; 8]>,
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

    pub fn create_path(&mut self, polygon: &Vec<Point<i32>>, poly_type: PolyType) -> usize {
        let mut last_index = polygon.len() - 1;

        while last_index > 0
            && unsafe {
                polygon[last_index].almost_equal(&polygon[0], None)
                    || polygon[last_index].almost_equal(&polygon[last_index - 1], None)
            }
        {
            last_index -= 1;
        }

        if last_index < 2 {
            return UNASSIGNED;
        }

        let mut indices: Vec<usize> = Vec::new();
        for i in 0..=last_index {
            self.is_use_full_range = polygon[i].range_test(self.is_use_full_range);
            self.edge_data.push([UNASSIGNED as u16; 8]);
            self.dx.push(0.0);
            self.wind.push([0; 3]);
            self.poly_type.push(poly_type);
            self.side.push(Direction::Left);
            self.points.push([
                Point::from(&polygon[i]),
                Point::new(None, None),
                Point::new(None, None),
                Point::new(None, None),
            ]);
            indices.push(self.dx.len());
        }

        let mut changed = true;
        while changed && indices.len() > 2 {
            changed = false;
            let mut i = 0;
            while i < indices.len() {
                let curr_index = indices[i];
                let next_index = indices[cycle_index(i, indices.len(), 1)];
                let prev_index = indices[cycle_index(i, indices.len(), -1)];

                if self.almost_equal(curr_index, next_index, EdgeSide::Current, EdgeSide::Current) {
                    if indices.len() <= 3 {
                        break;
                    }
                    indices.remove(i);
                    changed = true;
                    continue;
                }

                if unsafe {
                    Point::slopes_equal(
                        &self.points[prev_index - 1][EdgeSide::Current as usize],
                        &self.points[curr_index - 1][EdgeSide::Current as usize],
                        &self.points[next_index - 1][EdgeSide::Current as usize],
                        self.is_use_full_range,
                    )
                } {
                    if indices.len() <= 3 {
                        break;
                    }
                    indices.remove(i);
                    changed = true;
                    continue;
                }
                i += 1;
            }
        }

        if indices.len() < 3 {
            return UNASSIGNED;
        }

        let mut is_flat = true;
        let start_y = self.get_y(indices[0], EdgeSide::Current);
        let edge_count = indices.len();

        for i in 0..edge_count {
            let curr_index = indices[i];
            let next_index = indices[cycle_index(i, edge_count, 1)];

            if self.check_condition(
                curr_index,
                next_index,
                EdgeSide::Current,
                EdgeSide::Current,
                BoolCondition::GreaterOrEqual,
                false,
            ) {
                self.update(curr_index, curr_index, EdgeSide::Bottom, EdgeSide::Current);
                self.update(curr_index, next_index, EdgeSide::Top, EdgeSide::Current);
            } else {
                self.update(curr_index, curr_index, EdgeSide::Top, EdgeSide::Current);
                self.update(curr_index, next_index, EdgeSide::Bottom, EdgeSide::Current);
            }

            self.update(curr_index, curr_index, EdgeSide::Delta, EdgeSide::Top);
            let bottom_point = self.point(curr_index, EdgeSide::Bottom);
            unsafe {
                self.points[curr_index - 1][EdgeSide::Delta as usize].sub(&bottom_point);
            }

            self.dx[curr_index - 1] = if self.get_y(curr_index, EdgeSide::Delta) == 0 {
                f64::MIN_POSITIVE
            } else {
                self.get_x(curr_index, EdgeSide::Delta) as f64
                    / self.get_y(curr_index, EdgeSide::Delta) as f64
            };

            if is_flat && self.get_y(curr_index, EdgeSide::Current) != start_y {
                is_flat = false;
            }

            self.set_data_index(curr_index, 0, indices[cycle_index(i, edge_count, -1)]);
            self.set_data_index(curr_index, 1, indices[cycle_index(i, edge_count, 1)]);
        }

        if is_flat {
            UNASSIGNED
        } else {
            indices[0]
        }
    }

    pub fn get_x(&self, index: usize, side: EdgeSide) -> i32 {
        self.points[index - 1][side as usize].x
    }

    pub fn get_y(&self, index: usize, side: EdgeSide) -> i32 {
        self.points[index - 1][side as usize].y
    }

    pub fn check_condition(
        &self,
        index1: usize,
        index2: usize,
        side1: EdgeSide,
        side2: EdgeSide,
        condition: BoolCondition,
        is_x: bool,
    ) -> bool {
        let value1 = if is_x {
            self.get_x(index1, side1)
        } else {
            self.get_y(index1, side1)
        };
        let value2 = if is_x {
            self.get_x(index2, side2)
        } else {
            self.get_y(index2, side2)
        };

        match condition {
            BoolCondition::Unequal => value1 != value2,
            BoolCondition::Equal => value1 == value2,
            BoolCondition::Greater => value1 > value2,
            BoolCondition::GreaterOrEqual => value1 >= value2,
            BoolCondition::Less => value1 < value2,
            BoolCondition::LessOrEqual => value1 <= value2,
        }
    }

    pub fn update(
        &mut self,
        input_index: usize,
        update_index: usize,
        input_side: EdgeSide,
        update_side: EdgeSide,
    ) {
        let update_point = self.points[update_index - 1][update_side as usize];
        unsafe {
            self.points[input_index - 1][input_side as usize].update(&update_point);
        }
    }

    pub fn almost_equal(
        &self,
        index1: usize,
        index2: usize,
        side1: EdgeSide,
        side2: EdgeSide,
    ) -> bool {
        let point1 = &self.points[index1 - 1][side1 as usize];
        let point2 = &self.points[index2 - 1][side2 as usize];
        unsafe { point1.almost_equal(point2, None) }
    }

    pub fn point(&self, index: usize, side: EdgeSide) -> Point<i32> {
        self.points[index - 1][side as usize]
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
        let y = self.get_y(edge_index, EdgeSide::Bottom);
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

    pub fn find_next_loc_min(&self, index: usize) -> usize {
        let mut result = index;
        loop {
            let mut prev_index = self.prev(result);
            while !self.almost_equal(result, prev_index, EdgeSide::Bottom, EdgeSide::Bottom)
                || self.almost_equal(result, result, EdgeSide::Current, EdgeSide::Top)
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

            if self.check_condition(
                result,
                prev_index,
                EdgeSide::Top,
                EdgeSide::Bottom,
                BoolCondition::Equal,
                false,
            ) {
                continue;
            }

            prev_index = self.prev(edge_index);

            if self.check_condition(
                result,
                prev_index,
                EdgeSide::Bottom,
                EdgeSide::Bottom,
                BoolCondition::Greater,
                true,
            ) {
                result = edge_index;
            }
            break;
        }
        result
    }

    pub fn maxima_pair(&self, edge1_index: usize) -> usize {
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

    pub fn horz_direction(&self, index: usize) -> (Direction, i32, i32) {
        let bot_x = self.get_x(index, EdgeSide::Bottom);
        let top_x = self.get_x(index, EdgeSide::Top);
        if bot_x < top_x {
            (Direction::Right, bot_x, top_x)
        } else {
            (Direction::Left, top_x, bot_x)
        }
    }

    pub fn get_stop(&self, index: usize, point: &Point<i32>, is_protect: bool) -> bool {
        !is_protect
            && !self.has_next_local_minima(index)
            && unsafe { point.almost_equal(&self.point(index, EdgeSide::Top), None) }
    }

    pub fn get_intermediate(&self, index: usize, y: i32) -> bool {
        self.has_next_local_minima(index) && self.get_y(index, EdgeSide::Top) == y
    }

    pub fn get_maxima(&self, index: usize, y: i32) -> bool {
        if !self.has_next_local_minima(index) && self.get_y(index, EdgeSide::Top) == y {
            let temp_edge_index = self.maxima_pair(index);
            return temp_edge_index == UNASSIGNED || !self.is_horizontal(temp_edge_index);
        }
        false
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
                    return (self.poly_type(edge1_index) == PolyType::Clip
                        && e1_wc2.min(e2_wc2) > 0)
                        || (self.poly_type(edge1_index) == PolyType::Subject
                            && e1_wc2.max(e2_wc2) <= 0)
                }
                _ => return false,
            }
        }

        self.swap_sides(edge1_index, edge2_index);
        false
    }

    pub fn can_join_left(&self, index: usize) -> bool {
        if !self.is_filled(index) || self.prev_active(index) == UNASSIGNED {
            return false;
        }
        let prev_index = self.prev_active(index);
        self.check_condition(
            prev_index,
            index,
            EdgeSide::Current,
            EdgeSide::Bottom,
            BoolCondition::Equal,
            true,
        ) && self.is_filled(prev_index)
            && self.slopes_equal(self.prev_active(index), index)
    }

    pub fn can_join_right(&self, index: usize) -> bool {
        if !self.is_filled(index) || self.prev_active(index) == UNASSIGNED {
            return false;
        }
        let prev_index = self.prev_active(index);
        self.is_filled(prev_index) && self.slopes_equal(prev_index, index)
    }

    pub fn can_add_scanbeam(&self, index: usize) -> bool {
        if !self.is_filled(index) || self.prev_active(index) == UNASSIGNED {
            return false;
        }
        let prev_index = self.prev_active(index);
        self.is_filled(prev_index)
            && self.check_condition(
                prev_index,
                index,
                EdgeSide::Current,
                EdgeSide::Current,
                BoolCondition::Equal,
                true,
            )
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
        self.poly_type(index1) == self.poly_type(index2)
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

    pub fn check_horizontal_condition(&self, index: usize, is_next: bool) -> bool {
        let neighboar_index = self.get_neighboar(index, is_next, true);
        if neighboar_index == UNASSIGNED || !self.slopes_equal(index, neighboar_index) {
            return false;
        }
        self.almost_equal(neighboar_index, index, EdgeSide::Current, EdgeSide::Bottom)
            && self.is_filled(neighboar_index)
            && self.check_condition(
                neighboar_index,
                neighboar_index,
                EdgeSide::Current,
                EdgeSide::Top,
                BoolCondition::Greater,
                false,
            )
    }

    pub fn check_shared_condition(&self, index: usize, out_hash: usize, is_next: bool) -> bool {
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
            self.points[edge_index - 1][EdgeSide::Current as usize].x =
                self.top_x(edge_index, top_y);
            edge_index = self.copy_active_to_sorted(edge_index);
        }
        true
    }

    pub fn get_last_horizontal(&self, index: usize) -> usize {
        let mut result = index;
        while self.has_next_local_minima(result)
            && self.is_horizontal(self.get_next_local_minima(result))
        {
            result = self.get_next_local_minima(result);
        }
        result
    }

    pub fn get_max_pair(&self, index: usize) -> usize {
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
        if !self.has_next_local_minima(edge_index) {
            show_error("UpdateEdgeIntoAEL: invalid call");
        }
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
        let x = self.top_x(index, y);
        unsafe {
            self.points[index - 1][EdgeSide::Current as usize].set(x, y);
        }
    }

    pub fn is_assigned(&self, index: usize) -> bool {
        self.get_rec_index(index) != UNASSIGNED
    }

    pub fn is_horizontal(&self, index: usize) -> bool {
        self.get_y(index, EdgeSide::Delta) == 0
    }

    pub fn is_wind_deleta_empty(&self, index: usize) -> bool {
        self.wind_delta(index) == 0
    }

    pub fn unassign(&mut self, index: usize) {
        self.set_rec_index(index, UNASSIGNED);
    }

    pub fn get_intersect_x(&self, curr_index: usize, next_index: usize, bot_y: i32) -> i32 {
        let curr_dx_abs = self.dx(curr_index).abs();
        let next_dx_abs = self.dx(next_index).abs();
        // Use the edge with LARGER dx_abs (more vertical/less horizontal)
        // because we need to calculate x at a specific y
        let index = if curr_dx_abs < next_dx_abs {
            next_index
        } else {
            curr_index
        };

        self.top_x(index, bot_y)
    }

    pub fn get_intersect_error(
        &self,
        curr_index: usize,
        next_index: usize,
        point: &mut Point<i32>,
    ) -> bool {
        !self.intersect_point(curr_index, next_index, point)
            && self.get_x(curr_index, EdgeSide::Current)
                > self.get_x(next_index, EdgeSide::Current) + 1
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

    pub fn is_intermediate_horizontal_end(&self, curr_index: usize, horz_index: usize) -> bool {
        self.check_condition(
            curr_index,
            horz_index,
            EdgeSide::Current,
            EdgeSide::Top,
            BoolCondition::Equal,
            true,
        ) && self.has_next_local_minima(horz_index)
            && self.dx(curr_index) < self.dx(self.get_next_local_minima(horz_index))
    }

    pub fn insert_local_minima_into_ael(
        &mut self,
        left_bound_index: usize,
        right_bound_index: usize,
    ) -> bool {
        if left_bound_index == UNASSIGNED {
            self.insert_edge_into_ael(right_bound_index, None);
            self.set_winding_count(right_bound_index);
            return self.get_contributing(right_bound_index);
        }
        if right_bound_index == UNASSIGNED {
            self.insert_edge_into_ael(left_bound_index, None);
            self.set_winding_count(left_bound_index);
            return self.get_contributing(left_bound_index);
        }

        self.insert_edge_into_ael(left_bound_index, None);
        self.insert_edge_into_ael(right_bound_index, Some(left_bound_index));
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
        let top = Point::from(&self.point(index1, EdgeSide::Top));

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
            show_error("Error intersecting polylines");
        }
    }

    pub fn get_stopped(&self, index: usize, point: &Point<i32>, is_protect: bool) -> bool {
        !is_protect
            && !self.has_next_local_minima(index)
            && unsafe { point.almost_equal(&self.point(index, EdgeSide::Top), None) }
    }

    pub fn horz_segments_overlap(
        &self,
        point: &Point<i32>,
        join_x: i32,
        join_y: i32,
        edge_index: i32,
    ) -> bool {
        let off_point = Point::new(Some(join_x), Some(join_y));
        let top = self.point(edge_index as usize, EdgeSide::Top);
        let bot = self.point(edge_index as usize, EdgeSide::Bottom);
        unsafe { Point::horz_segments_overlap(point, &off_point, &bot, &top) }
    }

    pub fn get_intersect_index(&self, edge1_index: usize, edge2_index: usize) -> usize {
        let edge1_contributing = self.is_assigned(edge1_index);
        let edge2_contributing = self.is_assigned(edge2_index);
        let is_wind_delta_empty1 = self.is_wind_deleta_empty(edge1_index);
        let is_intersect_line_with_poly = self.intersect_line_with_poly(edge1_index, edge2_index);
        let is_same_poly_type = self.is_same_poly_type(edge1_index, edge2_index);

        if (is_intersect_line_with_poly && is_wind_delta_empty1 && edge2_contributing)
            || (!is_intersect_line_with_poly
                && !is_same_poly_type
                && self.intersect_line(edge1_index, edge2_index))
        {
            return edge1_index;
        }

        if (is_intersect_line_with_poly && !is_wind_delta_empty1 && edge1_contributing)
            || (!is_intersect_line_with_poly
                && !is_same_poly_type
                && self.intersect_line(edge2_index, edge1_index))
        {
            return edge2_index;
        }

        UNASSIGNED
    }

    fn reset_bound(&mut self, index: usize, side: Direction) {
        if index == UNASSIGNED {
            return;
        }
        self.update(index, index, EdgeSide::Current, EdgeSide::Bottom);
        self.set_side(index, side);
        self.set_rec_index(index, UNASSIGNED);
    }

    fn top_x(&self, index: usize, y: i32) -> i32 {
        let result = if y == self.get_y(index, EdgeSide::Top) {
            self.get_x(index, EdgeSide::Top)
        } else {
            self.get_x(index, EdgeSide::Bottom)
                + (self.dx(index) * (y - self.get_y(index, EdgeSide::Bottom)) as f64)
                    .clipper_rounded() as i32
        };

        if y == 54833 && result == 36218 {
            let top_y = self.get_y(index, EdgeSide::Top);
            let top_x = self.get_x(index, EdgeSide::Top);
            let bot_y = self.get_y(index, EdgeSide::Bottom);
            let bot_x = self.get_x(index, EdgeSide::Bottom);
            let dx = self.dx(index);
            eprintln!("\\ntop_x: index={}, y={}, result={}", index, y, result);
            eprintln!(
                "  Top=({}, {}), Bot=({}, {}), dx={}",
                top_x, top_y, bot_x, bot_y, dx
            );
            eprintln!("  y == top_y: {}", y == top_y);
            if y != top_y {
                let calc = bot_x as f64 + (dx * (y - bot_y) as f64);
                eprintln!(
                    "  Calculation: {} + ({} * {}) = {}",
                    bot_x,
                    dx,
                    y - bot_y,
                    calc
                );
                eprintln!("  Rounded: {}", calc.clipper_rounded());
            }
        }

        result
    }

    fn get_contributing(&self, index: usize) -> bool {
        let is_reverse =
            self.clip_type == ClipType::Difference && self.poly_type(index) == PolyType::Clip;
        let wind_count1 = self.wind_count1(index);
        let wind_count2 = self.wind_count2(index);

        match self.fill_type {
            PolyFillType::NonZero => wind_count1.abs() == 1 && is_reverse != (wind_count2 == 0),
            PolyFillType::Positive => wind_count1 == 1 && is_reverse != (wind_count2 <= 0),
            _ => wind_count1 == -1 && is_reverse != (wind_count2 >= 0),
        }
    }

    fn set_side(&mut self, index: usize, value: Direction) {
        if self.get_index_valid(index) {
            self.side[index - 1] = value;
        } else {
            show_error(&format!(
                "TEdgeController.set_side: index {} is out of bounds",
                index
            ));
        }
    }

    fn get_clockwise(&self, index: usize) -> bool {
        self.dx(index) >= self.dx(self.prev(index))
    }

    fn is_dx_horizontal(&self, index: usize) -> bool {
        self.dx(index) == f64::MIN_POSITIVE
    }

    fn process_bound(&mut self, index: usize, is_clockwise: bool) -> usize {
        if self.is_dx_horizontal(index) {
            let neighboar_index = self.base_neighboar(index, !is_clockwise);
            if self.check_condition(
                index,
                neighboar_index,
                EdgeSide::Bottom,
                EdgeSide::Bottom,
                BoolCondition::Unequal,
                true,
            ) {
                self.reverse_horizontal(index);
            }
        }

        let mut neighboar_index = self.base_neighboar(index, is_clockwise);
        let mut result_index = index;

        while self.check_condition(
            result_index,
            neighboar_index,
            EdgeSide::Top,
            EdgeSide::Bottom,
            BoolCondition::Equal,
            false,
        ) {
            result_index = neighboar_index;
            neighboar_index = self.base_neighboar(neighboar_index, is_clockwise);
        }

        if self.is_dx_horizontal(result_index) {
            let mut horz_neighboar_index = self.base_neighboar(result_index, !is_clockwise);
            while self.is_dx_horizontal(horz_neighboar_index) {
                horz_neighboar_index = self.base_neighboar(horz_neighboar_index, !is_clockwise);
            }

            let curr_neighboar_index = self.base_neighboar(result_index, is_clockwise);
            let horz_neighboar_x = self.get_x(horz_neighboar_index, EdgeSide::Top);
            let curr_neighboar_x = self.get_x(curr_neighboar_index, EdgeSide::Top);

            if (horz_neighboar_x == curr_neighboar_x && !is_clockwise)
                || horz_neighboar_x > curr_neighboar_x
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

    fn get_wind(&self, index: usize, wind_index: usize) -> i32 {
        self.wind[index - 1][wind_index]
    }

    fn set_wind(&mut self, index: usize, wind_index: usize, value: i32) {
        if self.get_index_valid(index) {
            self.wind[index - 1][wind_index] = value;
        }
    }

    fn wind_delta(&self, index: usize) -> i32 {
        self.get_wind(index, 0)
    }

    fn set_wind_delta(&mut self, index: usize, value: i32) {
        self.set_wind(index, 0, value);
    }

    fn wind_count1(&self, index: usize) -> i32 {
        self.get_wind(index, 1)
    }

    fn set_wind_count1(&mut self, index: usize, value: i32) {
        self.set_wind(index, 1, value);
    }

    fn wind_count2(&self, index: usize) -> i32 {
        self.get_wind(index, 2)
    }

    fn set_wind_count2(&mut self, index: usize, value: i32) {
        self.set_wind(index, 2, value);
    }

    fn check_reverse_horizontal(&self, edge_index: usize, index: usize, is_next: bool) -> bool {
        if edge_index == index {
            return false;
        }
        let neighboar_index = self.base_neighboar(edge_index, is_next);
        self.is_dx_horizontal(edge_index)
            && self.check_condition(
                edge_index,
                neighboar_index,
                EdgeSide::Bottom,
                EdgeSide::Top,
                BoolCondition::Unequal,
                true,
            )
    }

    fn get_index_valid(&self, index: usize) -> bool {
        index != UNASSIGNED && index <= self.dx.len()
    }

    fn next(&self, index: usize) -> usize {
        self.base_neighboar(index, true)
    }

    fn prev(&self, index: usize) -> usize {
        self.base_neighboar(index, false)
    }

    fn check_max_pair(&self, edge_index: usize, is_next: bool) -> bool {
        let index = self.base_neighboar(edge_index, is_next);
        if index == UNASSIGNED || self.has_next_local_minima(index) {
            return false;
        }
        self.almost_equal(index, edge_index, EdgeSide::Top, EdgeSide::Top)
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
        &self,
        edge1_index: usize,
        edge2_index: usize,
        intersect_point: &mut Point<i32>,
    ) -> bool {
        let dx1 = self.dx(edge1_index);
        let dx2 = self.dx(edge2_index);

        if self.slopes_equal(edge1_index, edge2_index) || dx1 == dx2 {
            let index = if self.check_condition(
                edge1_index,
                edge2_index,
                EdgeSide::Bottom,
                EdgeSide::Bottom,
                BoolCondition::Less,
                false,
            ) {
                edge2_index
            } else {
                edge1_index
            };
            let point = self.point(index, EdgeSide::Bottom);
            unsafe {
                intersect_point.update(&point);
            }
            return false;
        }

        let bot_x1 = self.get_x(edge1_index, EdgeSide::Bottom);
        let bot_x2 = self.get_x(edge2_index, EdgeSide::Bottom);
        let bot_y1 = self.get_y(edge1_index, EdgeSide::Bottom);
        let bot_y2 = self.get_y(edge2_index, EdgeSide::Bottom);

        if self.get_x(edge1_index, EdgeSide::Delta) == 0 {
            let new_y = if self.is_horizontal(edge2_index) {
                bot_y2
            } else {
                ((bot_x1 - bot_x2) as f64 / dx2 + bot_y2 as f64).clipper_rounded() as i32
            };
            unsafe {
                intersect_point.set(bot_x1, new_y);
            }
        } else if self.get_x(edge2_index, EdgeSide::Delta) == 0 {
            let new_y = if self.is_horizontal(edge1_index) {
                bot_y1
            } else {
                ((bot_x2 - bot_x1) as f64 / dx1 + bot_y1 as f64).clipper_rounded() as i32
            };
            unsafe {
                intersect_point.set(bot_x2, new_y);
            }
        } else {
            let b1 = bot_x1 as f64 - bot_y1 as f64 * dx1;
            let b2 = bot_x2 as f64 - bot_y2 as f64 * dx2;
            let q = (b2 - b1) / (dx1 - dx2);
            unsafe {
                intersect_point.set(
                    if dx1.abs() < dx2.abs() {
                        (dx1 * q + b1).clipper_rounded() as i32
                    } else {
                        (dx2 * q + b2).clipper_rounded() as i32
                    },
                    q.clipper_rounded() as i32,
                );
            }
        }

        let top_y1 = self.get_y(edge1_index, EdgeSide::Top);
        let top_y2 = self.get_y(edge2_index, EdgeSide::Top);

        if intersect_point.y < top_y1 || intersect_point.y < top_y2 {
            if top_y1 > top_y2 {
                unsafe {
                    intersect_point.set(self.top_x(edge2_index, top_y1), top_y1);
                }
                return intersect_point.x < self.get_x(edge1_index, EdgeSide::Top);
            }
            let new_x = if self.dx(edge1_index).abs() < self.dx(edge2_index).abs() {
                self.top_x(edge1_index, intersect_point.y)
            } else {
                self.top_x(edge2_index, intersect_point.y)
            };
            unsafe {
                intersect_point.set(new_x, top_y2);
            }
        }
        true
    }

    pub fn prepare_horz_joins(&self, index: usize) -> (usize, Direction, Point<i32>, Point<i32>) {
        let rec_index = self.get_rec_index(index);
        let side = self.side(index);
        let top = self.point(index, EdgeSide::Top);
        let bot = self.point(index, EdgeSide::Bottom);
        (rec_index, side, top, bot)
    }

    fn next_neighboar(&self, index: usize, is_ael: bool) -> usize {
        self.get_neighboar(index, true, is_ael)
    }

    fn prev_neighboar(&self, index: usize, is_ael: bool) -> usize {
        self.get_neighboar(index, false, is_ael)
    }

    fn reverse_horizontal(&mut self, index: usize) {
        let top_x = self.get_x(index, EdgeSide::Top);
        let bot_x = self.get_x(index, EdgeSide::Bottom);
        self.points[index - 1][EdgeSide::Top as usize].x = bot_x;
        self.points[index - 1][EdgeSide::Bottom as usize].x = top_x;
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
            self.edge_data[edge_index - 1][data_index] as usize
        } else {
            UNASSIGNED
        }
    }

    fn set_data_index(&mut self, edge_index: usize, data_index: usize, value: usize) {
        if self.get_index_valid(edge_index) {
            self.edge_data[edge_index - 1][data_index] = value as u16;
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

    fn insert_edge_into_ael(&mut self, index: usize, start_edge_index: Option<usize>) {
        if self.active == UNASSIGNED {
            self.set_prev_active(index, UNASSIGNED);
            self.set_next_active(index, UNASSIGNED);
            self.active = index;
            return;
        }

        if start_edge_index.is_none() && self.inserts_before(index, self.active) {
            self.set_prev_active(index, UNASSIGNED);
            self.set_next_active(index, self.active);
            self.set_neighboar(self.active, false, true, index);
            self.active = index;
            return;
        }

        let mut edge_index = start_edge_index.unwrap_or(self.active);
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

    fn inserts_before(&self, index1: usize, index2: usize) -> bool {
        if self.check_condition(
            index1,
            index2,
            EdgeSide::Current,
            EdgeSide::Current,
            BoolCondition::Equal,
            true,
        ) {
            if self.check_condition(
                index1,
                index2,
                EdgeSide::Top,
                EdgeSide::Top,
                BoolCondition::Greater,
                false,
            ) {
                self.get_x(index1, EdgeSide::Top)
                    < self.top_x(index2, self.get_y(index1, EdgeSide::Top))
            } else {
                self.get_x(index2, EdgeSide::Top)
                    > self.top_x(index1, self.get_y(index2, EdgeSide::Top))
            }
        } else {
            self.check_condition(
                index1,
                index2,
                EdgeSide::Current,
                EdgeSide::Current,
                BoolCondition::Less,
                true,
            )
        }
    }

    fn check_min_join(&self, curr_index: usize, prev_index: usize, point: &Point<i32>) -> bool {
        prev_index != UNASSIGNED
            && self.is_filled(prev_index)
            && self.top_x(prev_index, point.y) == self.top_x(curr_index, point.y)
            && self.slopes_equal(curr_index, prev_index)
            && !self.is_wind_deleta_empty(curr_index)
    }

    fn slopes_equal(&self, e1_index: usize, e2_index: usize) -> bool {
        slopes_equal(
            self.get_y(e1_index, EdgeSide::Delta) as f64,
            self.get_x(e2_index, EdgeSide::Delta) as f64,
            self.get_x(e1_index, EdgeSide::Delta) as f64,
            self.get_y(e2_index, EdgeSide::Delta) as f64,
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
        self.update(index, index, EdgeSide::Current, EdgeSide::Bottom);
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

    fn poly_type(&self, index: usize) -> PolyType {
        self.poly_type[index - 1]
    }

    pub fn get_current_active(&self, edge_index: usize, prev_index: usize) -> usize {
        if self.prev_active(edge_index) == UNASSIGNED {
            self.active
        } else {
            self.next_active(prev_index)
        }
    }
}
