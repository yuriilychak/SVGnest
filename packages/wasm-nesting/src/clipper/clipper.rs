use crate::{
    clipper::{
        constants::UNASSIGNED,
        enums::{ClipType, Direction, PolyFillType, PolyType},
        intersect_node::IntersectNode,
        join::Join,
        local_minima::LocalMinima,
        out_rec::OutRec,
        scanbeam::Scanbeam,
        t_edge::TEdge,
    },
    geometry::point::Point,
    utils::bit_ops::{get_u16, join_u16},
};

pub struct Clipper {
    local_minima: LocalMinima,
    intersections: IntersectNode,
    scanbeam: Scanbeam,
    t_edge: TEdge,
    join: Join,
    out_rec: OutRec,
    is_execute_locked: bool,
}

impl Clipper {
    pub fn new(reverse_solution: bool, strictly_simple: bool) -> Self {
        Self {
            intersections: IntersectNode::new(),
            local_minima: LocalMinima::new(),
            scanbeam: Scanbeam::new(),
            t_edge: TEdge::new(),
            join: Join::new(),
            out_rec: OutRec::new(reverse_solution, strictly_simple),
            is_execute_locked: false,
        }
    }

    pub fn add_path(&mut self, polygon: &Vec<Point<i32>>, poly_type: PolyType) -> bool {
        let mut edge_index = self.t_edge.create_path(polygon, poly_type);
        if edge_index == UNASSIGNED {
            return false;
        }

        let mut min_index = UNASSIGNED;
        loop {
            edge_index = self.t_edge.find_next_loc_min(edge_index);
            if edge_index == min_index {
                break;
            }
            if min_index == UNASSIGNED {
                min_index = edge_index;
            }

            let (y, left_bound, right_bound) = self.t_edge.create_local_minima(edge_index);
            let local_minima = self.local_minima.insert(y, left_bound, right_bound);

            edge_index = self.t_edge.process_bounds(
                edge_index,
                self.local_minima.get_left_bound(local_minima),
                self.local_minima.get_right_bound(local_minima),
            );
        }
        true
    }

    pub fn add_paths(&mut self, polygons: &[Vec<Point<i32>>], poly_type: PolyType) -> bool {
        let mut result = false;
        for polygon in polygons {
            if self.add_path(polygon, poly_type) {
                result = true;
            }
        }
        result
    }

    pub fn execute(
        &mut self,
        clip_type: ClipType,
        solution: &mut Vec<Vec<Point<i32>>>,
        fill_type: PolyFillType,
    ) -> bool {
        if self.is_execute_locked {
            return false;
        }
        self.is_execute_locked = true;
        self.t_edge.init(clip_type, fill_type);
        solution.clear();

        let succeeded = self.execute_internal();
        if succeeded {
            self.out_rec.build_result(solution);
        }

        self.out_rec.dispose();
        self.t_edge.dispose();
        self.is_execute_locked = false;
        succeeded
    }

    fn execute_internal(&mut self) -> bool {
        self.reset();
        if self.local_minima.is_empty() {
            return false;
        }

        let mut bot_y = self.scanbeam.pop();
        loop {
            self.insert_local_minima_into_ael(bot_y);
            self.join.clear_ghosts();
            self.process_horizontals(false);

            if self.scanbeam.is_empty() {
                break;
            }

            let top_y = self.scanbeam.pop();
            if !self.process_intersections(bot_y, top_y) {
                return false;
            }
            self.process_edges_at_top_of_scanbeam(top_y);
            bot_y = top_y;

            if self.scanbeam.is_empty() && self.local_minima.is_empty() {
                break;
            }
        }
        self.fixup_out_polygon();
        true
    }

    fn reset(&mut self) {
        self.scanbeam.clean();
        let minima_count = self.local_minima.len();
        for i in 0..minima_count {
            let left_bound = self.local_minima.get_left_bound(i);
            let right_bound = self.local_minima.get_right_bound(i);
            let y = self.local_minima.get_y(i);
            self.t_edge.reset_bounds(left_bound, right_bound);
            self.scanbeam.insert(y);
        }
        self.t_edge.reset();
    }

    fn update_edge_into_ael(&mut self, edge_index: usize) -> usize {
        let result = self.t_edge.update_edge_into_ael(edge_index);
        if !self.t_edge.is_horizontal(result) {
            self.scanbeam.insert(self.t_edge.top(result).y);
        }
        result
    }

    fn build_intersect_list(&mut self, bot_y: i32, top_y: i32) {
        if !self.t_edge.prepare_for_intersections(top_y) {
            return;
        }

        let mut is_modified = true;
        let mut point = Point::new(None, None);
        while is_modified && self.t_edge.sorted != UNASSIGNED {
            is_modified = false;
            let mut curr_index = self.t_edge.sorted;
            while self.t_edge.next_sorted(curr_index) != UNASSIGNED {
                let next_index = self.t_edge.next_sorted(curr_index);
                unsafe {
                    point.set(0, 0);
                }
                if self.t_edge.curr(curr_index).x > self.t_edge.curr(next_index).x {
                    if self
                        .t_edge
                        .get_intersect_error(curr_index, next_index, &mut point)
                    {
                        // showError('Intersection error');
                    }
                    if point.y > bot_y {
                        unsafe {
                            point.set(
                                self.t_edge.get_intersect_x(curr_index, next_index, bot_y),
                                bot_y,
                            );
                        }
                    }
                    self.intersections
                        .add(curr_index, next_index, point.x, point.y);
                    self.t_edge
                        .swap_positions_in_list(curr_index, next_index, false);
                    is_modified = true;
                } else {
                    curr_index = next_index;
                }
            }
            let prev_index = self.t_edge.prev_sorted(curr_index);
            if prev_index == UNASSIGNED {
                break;
            }
            self.t_edge
                .set_neighboar(prev_index, true, false, UNASSIGNED);
        }
        self.t_edge.sorted = UNASSIGNED;
    }

    fn intersect_edges(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        point: &Point<i32>,
        is_protect: bool,
    ) {
        let edge1_stops = self.t_edge.get_stop(edge1_index, point, is_protect);
        let edge2_stops = self.t_edge.get_stop(edge2_index, point, is_protect);
        let edge1_contributing = self.t_edge.is_assigned(edge1_index);
        let edge2_contributing = self.t_edge.is_assigned(edge2_index);

        if self.t_edge.is_wind_deleta_empty(edge1_index)
            || self.t_edge.is_wind_deleta_empty(edge2_index)
        {
            self.intersect_open_edges(edge1_index, edge2_index, is_protect, point);
            return;
        }

        self.t_edge.align_wnd_count(edge1_index, edge2_index);
        let e1_wc = self.t_edge.get_wnd_type_filled(edge1_index);
        let e2_wc = self.t_edge.get_wnd_type_filled(edge2_index);

        if edge1_contributing && edge2_contributing {
            if edge1_stops
                || edge2_stops
                || (e1_wc != 0 && e1_wc != 1)
                || (e2_wc != 0 && e2_wc != 1)
                || !self.t_edge.is_same_poly_type(edge1_index, edge2_index)
            {
                self.add_local_max_poly(edge1_index, edge2_index, point);
            } else {
                self.add_out_pt(edge1_index, point);
                self.add_out_pt(edge2_index, point);
                self.t_edge.swap_sides_and_indeces(edge1_index, edge2_index);
            }
        } else if edge1_contributing {
            if e2_wc == 0 || e2_wc == 1 {
                self.add_out_pt(edge1_index, point);
                self.t_edge.swap_sides_and_indeces(edge1_index, edge2_index);
            }
        } else if edge2_contributing {
            if e1_wc == 0 || e1_wc == 1 {
                self.add_out_pt(edge2_index, point);
                self.t_edge.swap_sides_and_indeces(edge1_index, edge2_index);
            }
        } else if (e1_wc == 0 || e1_wc == 1)
            && (e2_wc == 0 || e2_wc == 1)
            && !edge1_stops
            && !edge2_stops
        {
            if self
                .t_edge
                .swap_edges(e1_wc, e2_wc, edge1_index, edge2_index)
            {
                self.add_local_min_poly(edge1_index, edge2_index, point);
            }
        }

        if edge1_stops != edge2_stops
            && ((edge1_stops && self.t_edge.is_assigned(edge1_index))
                || (edge2_stops && self.t_edge.is_assigned(edge2_index)))
        {
            self.t_edge.swap_sides_and_indeces(edge1_index, edge2_index);
        }

        if edge1_stops {
            self.t_edge.delete_from_list(edge1_index, true);
        }
        if edge2_stops {
            self.t_edge.delete_from_list(edge2_index, true);
        }
    }

    fn edges_adjacent(&self, node_index: usize) -> bool {
        let edge1_index = self.intersections.get_edge1_index(node_index);
        let edge2_index = self.intersections.get_edge2_index(node_index);
        self.t_edge.is_neighboar(edge1_index, edge2_index, false)
    }

    fn fixup_intersection_order(&mut self) -> bool {
        self.intersections.sort();
        self.t_edge.copy_ael_to_sel();
        let intersect_count = self.intersections.len();
        for i in 0..intersect_count {
            if !self.edges_adjacent(i) {
                let mut j = i + 1;
                while j < intersect_count && !self.edges_adjacent(j) {
                    j += 1;
                }
                if j == intersect_count {
                    return false;
                }
                self.intersections.swap(i, j);
            }
            self.t_edge.swap_positions_in_list(
                self.intersections.get_edge1_index(i),
                self.intersections.get_edge2_index(i),
                false,
            );
        }
        true
    }

    fn apply_intersection(&mut self, index: usize, point: &Point<i32>, is_contributing: bool) {
        self.add_out_pt(index, point);
        if is_contributing {
            self.t_edge.unassign(index);
        }
    }

    fn intersect_open_edges(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        is_protect: bool,
        point: &Point<i32>,
    ) {
        let edge1_stops = self.t_edge.get_stopped(edge1_index, point, is_protect);
        let edge2_stops = self.t_edge.get_stopped(edge2_index, point, is_protect);
        let edge1_contributing = self.t_edge.is_assigned(edge1_index);
        let edge2_contributing = self.t_edge.is_assigned(edge2_index);

        if self.t_edge.is_wind_deleta_empty(edge1_index)
            && self.t_edge.is_wind_deleta_empty(edge2_index)
        {
            if (edge1_stops || edge2_stops) && edge1_contributing && edge2_contributing {
                self.add_local_max_poly(edge1_index, edge2_index, point);
            }
        } else if self
            .t_edge
            .intersect_line_with_poly(edge1_index, edge2_index)
        {
            if self.t_edge.is_wind_deleta_empty(edge1_index) {
                if edge2_contributing {
                    self.apply_intersection(edge1_index, point, edge1_contributing);
                }
            } else {
                if edge1_contributing {
                    self.apply_intersection(edge2_index, point, edge2_contributing);
                }
            }
        } else if !self.t_edge.is_same_poly_type(edge1_index, edge2_index) {
            if self.t_edge.intersect_line(edge1_index, edge2_index) {
                self.apply_intersection(edge1_index, point, edge1_contributing);
            } else if self.t_edge.intersect_line(edge2_index, edge1_index) {
                self.apply_intersection(edge2_index, point, edge2_contributing);
            }
        }

        if edge1_stops {
            self.t_edge.delete_intersect_asignment(edge1_index);
        }
        if edge2_stops {
            self.t_edge.delete_intersect_asignment(edge2_index);
        }
    }

    fn process_horizontal(&mut self, horz_edge_index: usize, is_top_of_scanbeam: bool) {
        let (mut dir, mut horz_left, mut horz_right) = self.t_edge.horz_direction(horz_edge_index);
        let last_horz_index = self.t_edge.get_last_horizontal(horz_edge_index);
        let max_pair_index = self.t_edge.get_max_pair(last_horz_index);
        let mut horz_index = horz_edge_index;

        loop {
            let is_last_horz = horz_index == last_horz_index;
            let mut curr_index =
                self.t_edge
                    .get_neighboar(horz_index, dir == Direction::Right, true);
            let is_right = dir == Direction::Right;

            while curr_index != UNASSIGNED {
                if self
                    .t_edge
                    .is_intermediate_horizontal_end(curr_index, horz_index)
                {
                    break;
                }

                let next_index = self.t_edge.get_neighboar(curr_index, is_right, true);
                if (is_right && self.t_edge.curr(curr_index).x <= horz_right)
                    || (!is_right && self.t_edge.curr(curr_index).x >= horz_left)
                {
                    if self.t_edge.is_filled(horz_index) && is_top_of_scanbeam {
                        self.prepare_horz_joins(horz_index);
                    }

                    let index1 = if is_right { horz_index } else { curr_index };
                    let index2 = if is_right { curr_index } else { horz_index };

                    if curr_index == max_pair_index && is_last_horz {
                        unsafe {
                            let top = self.t_edge.top(curr_index) as *const Point<i32>;
                            self.intersect_edges(index1, index2, &*top, false);
                        }
                        if self.t_edge.is_assigned(max_pair_index) {
                            // showError('ProcessHorizontal error');
                        }
                        return;
                    }

                    unsafe {
                        let point = self.t_edge.curr(curr_index) as *const Point<i32>;
                        self.intersect_edges(index1, index2, &*point, true);
                    }
                    self.t_edge
                        .swap_positions_in_list(horz_index, curr_index, true);
                } else if (is_right && self.t_edge.curr(curr_index).x >= horz_right)
                    || (!is_right && self.t_edge.curr(curr_index).x <= horz_left)
                {
                    break;
                }
                curr_index = next_index;
            }

            if self.t_edge.is_filled(horz_edge_index) && is_top_of_scanbeam {
                self.prepare_horz_joins(horz_index);
            }

            if self.t_edge.has_next_local_minima(horz_index)
                && self
                    .t_edge
                    .is_horizontal(self.t_edge.get_next_local_minima(horz_index))
            {
                horz_index = self.update_edge_into_ael(horz_index);
                if self.t_edge.is_assigned(horz_index) {
                    unsafe {
                        let bot = self.t_edge.bot(horz_index) as *const Point<i32>;
                        self.add_out_pt(horz_index, &*bot);
                    }
                }
                let (new_dir, new_horz_left, new_horz_right) =
                    self.t_edge.horz_direction(horz_index);
                dir = new_dir;
                horz_left = new_horz_left;
                horz_right = new_horz_right;
            } else {
                break;
            }
        }

        if self.t_edge.has_next_local_minima(horz_index) {
            if self.t_edge.is_assigned(horz_index) {
                unsafe {
                    let top = self.t_edge.top(horz_index) as *const Point<i32>;
                    let op1 = self.add_out_pt(horz_index, &*top);

                    horz_index = self.update_edge_into_ael(horz_index);
                    if self.t_edge.is_wind_deleta_empty(horz_index) {
                        return;
                    }
                    let condition1 = self.t_edge.check_horizontal_condition(horz_index, false);
                    self.insert_join_from_edge(condition1, op1, horz_index, false, false);
                    if !condition1 {
                        let condition2 = self.t_edge.check_horizontal_condition(horz_index, true);
                        self.insert_join_from_edge(condition2, op1, horz_index, true, false);
                    }
                }

                return;
            }
            self.update_edge_into_ael(horz_index);
            return;
        }

        if max_pair_index != UNASSIGNED {
            if self.t_edge.is_assigned(max_pair_index) {
                let index1 = if dir == Direction::Right {
                    horz_index
                } else {
                    max_pair_index
                };
                let index2 = if dir == Direction::Right {
                    max_pair_index
                } else {
                    horz_index
                };
                unsafe {
                    let top = self.t_edge.top_lnk(horz_index) as *const Point<i32>;
                    self.intersect_edges(index1, index2, &*top, false);
                }
                if self.t_edge.is_assigned(max_pair_index) {
                    // showError('ProcessHorizontal error');
                }
                return;
            }
            self.t_edge.delete_from_list(horz_index, true);
            self.t_edge.delete_from_list(max_pair_index, true);
            return;
        }

        if self.t_edge.is_assigned(horz_index) {
            unsafe {
                let top = self.t_edge.top_lnk(horz_index) as *const Point<i32>;
                self.add_out_pt(horz_index, &*top);
            }
        }
        self.t_edge.delete_from_list(horz_index, true);
    }

    fn process_horizontals(&mut self, is_top_of_scanbeam: bool) {
        let mut horz_edge_index = self.t_edge.sorted;
        while horz_edge_index != UNASSIGNED {
            self.t_edge.delete_from_list(horz_edge_index, false);
            self.process_horizontal(horz_edge_index, is_top_of_scanbeam);
            horz_edge_index = self.t_edge.sorted;
        }
    }

    fn process_edges_at_top_of_scanbeam(&mut self, top_y: i32) {
        let mut edge_index = self.t_edge.active;
        while edge_index != UNASSIGNED {
            let mut is_maxima_edge = self.t_edge.get_maxima(edge_index, top_y);
            if is_maxima_edge {
                let temp_edge_index = self.t_edge.maxima_pair(edge_index);
                is_maxima_edge =
                    temp_edge_index == UNASSIGNED || !self.t_edge.is_horizontal(temp_edge_index);
            }

            if is_maxima_edge {
                let prev_index = self.t_edge.prev_active(edge_index);
                self.do_maxima(edge_index);
                edge_index = if self.t_edge.prev_active(edge_index) == UNASSIGNED {
                    self.t_edge.active
                } else {
                    self.t_edge.next_active(prev_index)
                };
                continue;
            }

            if self.t_edge.get_intermediate(edge_index, top_y)
                && self
                    .t_edge
                    .is_horizontal(self.t_edge.get_next_local_minima(edge_index))
            {
                edge_index = self.update_edge_into_ael(edge_index);
                if self.t_edge.is_assigned(edge_index) {
                    unsafe {
                        let bot = self.t_edge.bot(edge_index) as *const Point<i32>;
                        self.add_out_pt(edge_index, &*bot);
                    }
                }
                self.t_edge.add_edge_to_sel(edge_index);
            } else {
                self.t_edge.curr_from_top_x(edge_index, top_y);
            }

            if self.out_rec.strictly_simple() && self.t_edge.can_add_scanbeam(edge_index) {
                unsafe {
                    let curr = self.t_edge.curr(edge_index) as *const Point<i32>;
                    self.add_scanbeam_join(edge_index, self.t_edge.prev_active(edge_index), &*curr);
                }
            }
            edge_index = self.t_edge.next_active(edge_index);
        }

        self.process_horizontals(true);
        edge_index = self.t_edge.active;
        while edge_index != UNASSIGNED {
            if self.t_edge.get_intermediate(edge_index, top_y) {
                let out_pt1 = if self.t_edge.is_assigned(edge_index) {
                    unsafe {
                        let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
                        self.add_out_pt(edge_index, &*top)
                    }
                } else {
                    UNASSIGNED as u32
                };
                edge_index = self.update_edge_into_ael(edge_index);
                let condition1 = self
                    .t_edge
                    .check_shared_condition(edge_index, out_pt1, false);
                if !self.insert_join_from_edge(condition1, out_pt1, edge_index, false, true) {
                    let condition2 = self
                        .t_edge
                        .check_shared_condition(edge_index, out_pt1, true);
                    self.insert_join_from_edge(condition2, out_pt1, edge_index, true, true);
                }
            }
            edge_index = self.t_edge.next_active(edge_index);
        }
    }

    fn do_maxima(&mut self, edge_index: usize) {
        if self.t_edge.maxima_pair(edge_index) == UNASSIGNED {
            if self.t_edge.is_assigned(edge_index) {
                unsafe {
                    let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
                    self.add_out_pt(edge_index, &*top);
                }
            }
            self.t_edge.delete_from_list(edge_index, true);
            return;
        }

        let mut next_edge_index = self.t_edge.next_active(edge_index);
        unsafe {
            while next_edge_index != UNASSIGNED
                && next_edge_index != self.t_edge.maxima_pair(edge_index)
            {
                let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
                self.intersect_edges(edge_index, next_edge_index, &*top, true);
                self.t_edge
                    .swap_positions_in_list(edge_index, next_edge_index, true);
                next_edge_index = self.t_edge.next_active(edge_index);
            }
        }

        let max_index = self.t_edge.maxima_pair(edge_index);
        if !self.t_edge.is_assigned(edge_index) && !self.t_edge.is_assigned(max_index) {
            self.t_edge.delete_from_list(edge_index, true);
            self.t_edge.delete_from_list(max_index, true);
        } else if self.t_edge.is_assigned(edge_index) && self.t_edge.is_assigned(max_index) {
            unsafe {
                let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
                self.intersect_edges(edge_index, max_index, &*top, false);
            }
        } else if self.t_edge.is_wind_deleta_empty(edge_index) {
            if self.t_edge.is_assigned(edge_index) {
                unsafe {
                    let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
                    self.add_out_pt(edge_index, &*top);
                }
                self.t_edge.unassign(edge_index);
            }
            self.t_edge.delete_from_list(edge_index, true);
            if self.t_edge.is_assigned(max_index) {
                unsafe {
                    let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
                    self.add_out_pt(max_index, &*top);
                }
                self.t_edge.unassign(max_index);
            }
            self.t_edge.delete_from_list(max_index, true);
        } else {
            // showError('DoMaxima error');
        }
    }

    fn process_intersect_list(&mut self) {
        let intersect_count = self.intersections.len();
        let mut point = Point::new(None, None);
        for i in 0..intersect_count {
            let edge1_index = self.intersections.get_edge1_index(i);
            let edge2_index = self.intersections.get_edge2_index(i);
            unsafe {
                point.set(self.intersections.get_x(i), self.intersections.get_y(i));
            }
            self.intersect_edges(edge1_index, edge2_index, &point, true);
            self.t_edge
                .swap_positions_in_list(edge1_index, edge2_index, true);
        }
        self.intersections.clean();
    }

    fn process_intersections(&mut self, bot_y: i32, top_y: i32) -> bool {
        if self.t_edge.active == UNASSIGNED {
            return true;
        }
        self.build_intersect_list(bot_y, top_y);
        if self.intersections.is_empty() {
            return true;
        }
        if self.intersections.len() == 1 || self.fixup_intersection_order() {
            self.process_intersect_list();
        } else {
            return false;
        }
        self.t_edge.sorted = UNASSIGNED;
        true
    }

    fn insert_local_minima_pt(&mut self, left_bound_index: usize, right_bound_index: usize) -> u32 {
        let index = if left_bound_index != UNASSIGNED {
            left_bound_index
        } else {
            right_bound_index
        };
        unsafe {
            let bot = self.t_edge.bot_lnk(index) as *const Point<i32>;
            if left_bound_index != UNASSIGNED && right_bound_index != UNASSIGNED {
                self.add_local_min_poly(left_bound_index, right_bound_index, &*bot)
            } else {
                self.add_out_pt(index, &*bot)
            }
        }
    }

    fn insert_local_minima_into_ael(&mut self, bot_y: i32) {
        while matches!(self.local_minima.min_y(), Some(y) if y == bot_y) {
            let (left_bound_index, right_bound_index) = self.local_minima.pop();
            let out_pt = if self
                .t_edge
                .insert_local_minima_into_ael(left_bound_index, right_bound_index)
            {
                self.insert_local_minima_pt(left_bound_index, right_bound_index)
            } else {
                UNASSIGNED as u32
            };

            if left_bound_index != UNASSIGNED {
                self.scanbeam.insert(self.t_edge.top(left_bound_index).y);
            }
            if right_bound_index != UNASSIGNED {
                if self.t_edge.is_horizontal(right_bound_index) {
                    self.t_edge.add_edge_to_sel(right_bound_index);
                } else {
                    self.scanbeam.insert(self.t_edge.top(right_bound_index).y);
                }
            }

            if left_bound_index == UNASSIGNED || right_bound_index == UNASSIGNED {
                continue;
            }

            if out_pt != (UNASSIGNED as u32)
                && self.t_edge.is_horizontal(right_bound_index)
                && !self.t_edge.is_wind_deleta_empty(right_bound_index)
            {
                self.add_output_joins(out_pt, right_bound_index);
            }

            let condition = self.t_edge.can_join_left(left_bound_index);
            self.insert_join_from_edge(condition, out_pt, left_bound_index, false, true);

            if self.t_edge.next_active(left_bound_index) != right_bound_index {
                let condition = self.t_edge.can_join_right(right_bound_index);
                self.insert_join_from_edge(condition, out_pt, right_bound_index, false, true);
                if self.t_edge.next_active(left_bound_index) != UNASSIGNED {
                    let mut edge_index = self.t_edge.next_active(left_bound_index);
                    while edge_index != right_bound_index {
                        unsafe {
                            let curr = self.t_edge.curr(edge_index) as *const Point<i32>;
                            self.intersect_edges(
                                right_bound_index,
                                edge_index,
                                &*curr,
                                false,
                            );
                        }
                        edge_index = self.t_edge.get_neighboar(edge_index, true, true);
                    }
                }
            }
        }
    }

    fn insert_join_from_edge(
        &mut self,
        condition: bool,
        out_hash1: u32,
        edge_index: usize,
        is_next: bool,
        is_top2: bool,
    ) -> bool {
        unsafe {
            let point1 = self.t_edge.bot(edge_index) as *const Point<i32>;
            let point2 = if is_top2 {
                self.t_edge.top(edge_index) as *const Point<i32>
            } else {
                self.t_edge.bot(edge_index) as *const Point<i32>
            };

            self.insert_join(
                condition,
                out_hash1,
                self.t_edge.get_neighboar(edge_index, is_next, true),
                &*point1,
                &*point2,
            )
        }
    }

    fn insert_join(
        &mut self,
        condition: bool,
        out_hash1: u32,
        edge_index: usize,
        point1: &Point<i32>,
        point2: &Point<i32>,
    ) -> bool {
        if condition {
            let out_hash2 = self.add_out_pt(edge_index, point1);
            self.join.add(out_hash1, out_hash2, point2);
        }
        condition
    }

    fn add_scanbeam_join(&mut self, edge1_index: usize, edge2_index: usize, point: &Point<i32>) {
        let out_pt1 = self.add_out_pt(edge2_index, point);
        let out_pt2 = self.add_out_pt(edge1_index, point);
        self.join.add(out_pt1, out_pt2, point);
    }

    fn add_output_joins(&mut self, out_hash: u32, right_bound_index: usize) {
        let join_count = self.join.len(true);
        if join_count > 0 {
            let mut point = Point::new(None, None);
            for i in 0..join_count {
                unsafe {
                    point.set(self.join.get_x(i, true), self.join.get_y(i, true));
                }
                if self.horz_segments_overlap(
                    self.join.get_hash1(i, true),
                    &point,
                    right_bound_index,
                ) {
                    self.join.from_ghost(i, out_hash);
                }
            }
        }
    }

    fn prepare_horz_joins(&mut self, horz_edge_index: usize) {
        let rec_index = self.t_edge.get_rec_index(horz_edge_index);
        let side = self.t_edge.side(horz_edge_index);
        unsafe {
            let top = self.t_edge.top(horz_edge_index) as *const Point<i32>;
            let bot = self.t_edge.bot(horz_edge_index) as *const Point<i32>;
            let (out_pt_hash, x, y) = self.out_rec.get_join_data(rec_index, side, &*top, &*bot);
            self.join.add_ghost(out_pt_hash, x, y);
        }
    }

    fn add_out_pt(&mut self, edge_index: usize, point: &Point<i32>) -> u32 {
        let out_rec_index;
        let point_index;

        if !self.t_edge.is_assigned(edge_index) {
            point_index = self.out_rec.from_point(point);
            out_rec_index = self.out_rec.create(point_index);
            self.set_hole_state(out_rec_index, edge_index);
            self.t_edge
                .set_rec_index(edge_index, self.out_rec.current_index(out_rec_index));
        } else {
            let is_to_front = self.t_edge.side(edge_index) == Direction::Left;
            let rec_index = self.t_edge.get_rec_index(edge_index);
            out_rec_index = self.out_rec.get_out_rec(rec_index);
            point_index = self.out_rec.add_out_pt(rec_index, is_to_front, point);
        }

        self.out_rec.get_hash(out_rec_index, point_index)
    }

    fn add_local_min_poly(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        point: &Point<i32>,
    ) -> u32 {
        let first_index;
        let second_index;
        if self.t_edge.is_horizontal(edge2_index)
            || self.t_edge.dx(edge1_index) > self.t_edge.dx(edge2_index)
        {
            first_index = edge1_index;
            second_index = edge2_index;
        } else {
            first_index = edge2_index;
            second_index = edge1_index;
        }

        let result = self.add_out_pt(first_index, point);
        let (condition, prev_index, top) =
            self.t_edge
                .add_local_min_poly(first_index, second_index, point);
        self.insert_join(condition, result, prev_index, point, &top);
        result
    }

    fn add_local_max_poly(&mut self, edge1_index: usize, edge2_index: usize, point: &Point<i32>) {
        self.add_out_pt(edge1_index, point);
        if self.t_edge.is_wind_deleta_empty(edge2_index) {
            self.add_out_pt(edge2_index, point);
        }

        let rec_index1 = self.t_edge.get_rec_index(edge1_index);
        let rec_index2 = self.t_edge.get_rec_index(edge2_index);

        if rec_index1 == rec_index2 {
            self.t_edge.unassign(edge1_index);
            self.t_edge.unassign(edge2_index);
            return;
        }

        let (first_index, second_index) = if rec_index1 < rec_index2 {
            (edge1_index, edge2_index)
        } else {
            (edge2_index, edge1_index)
        };

        let first_rec_index = self.t_edge.get_rec_index(first_index);
        let second_rec_index = self.t_edge.get_rec_index(second_index);
        let first_side = self.t_edge.side(first_index);
        let second_side = self.t_edge.side(second_index);

        self.t_edge.add_local_max_poly(first_index, second_index);
        self.out_rec
            .join_polys(first_rec_index, second_rec_index, first_side, second_side);
    }

    fn fixup_out_polygon(&mut self) {
        self.out_rec.fix_directions();
        let join_count = self.join.len(false);
        let mut point = Point::new(None, None);
        for i in 0..join_count {
            unsafe {
                point.set(self.join.get_x(i, false), self.join.get_y(i, false));
            }
            self.join_common_edge(i, &point);
        }
        self.out_rec
            .fix_out_polygon(self.t_edge.is_use_full_range());
    }

    fn set_hole_state(&mut self, rec_index: usize, edge_index: usize) {
        let (is_hole, index) = self
            .t_edge
            .get_hole_state(self.out_rec.first_left_index(rec_index), edge_index);
        self.out_rec.set_hole_state(rec_index, is_hole, index);
    }

    fn join_common_edge(&mut self, index: usize, off_point: &Point<i32>) {
        let input_hash1 = self.join.get_hash1(index, false);
        let input_hash2 = self.join.get_hash2(index);
        let (out_hash1, out_hash2, result) = self.join_points(input_hash1, input_hash2, off_point);

        if !result {
            self.join.update_hash(index, out_hash1, out_hash2);
            return;
        }

        let index1 = get_u16(out_hash1, 0) as usize;
        let index2 = get_u16(out_hash2, 0) as usize;
        let out_pt1_index = get_u16(out_hash1, 1) as usize;
        let out_pt2_index = get_u16(out_hash2, 1) as usize;
        let out_rec1 = self.out_rec.get_out_rec(index1);
        let out_rec2 = self.out_rec.get_out_rec(index2);

        if index1 == index2 {
            self.out_rec
                .split_polys(out_rec1, out_pt1_index, out_pt2_index);
            self.join.update_hash(index, out_hash1, out_hash2);
            return;
        }

        self.out_rec.join_polys2(out_rec1, out_rec2);
        self.join.update_hash(index, out_hash1, out_hash2);
    }

    fn join_points(
        &mut self,
        out_hash1: u32,
        out_hash2: u32,
        off_point: &Point<i32>,
    ) -> (u32, u32, bool) {
        let index1 = get_u16(out_hash1, 0) as usize;
        let index2 = get_u16(out_hash2, 0) as usize;
        let out_rec1 = self.out_rec.get_out_rec(index1);
        let out_rec2 = self.out_rec.get_out_rec(index2);
        let default_result = (out_hash1, out_hash2, false);

        if self.out_rec.is_unassigned(out_rec1) || self.out_rec.is_unassigned(out_rec2) {
            return default_result;
        }

        let out_pt1_index = get_u16(out_hash1, 1) as usize;
        let out_pt2_index = get_u16(out_hash2, 1) as usize;
        let is_records_same = out_rec1 == out_rec2;
        let is_horizontal = self.out_rec.point_y(out_pt1_index) == off_point.y;

        if is_horizontal {
            return self
                .out_rec
                .horizontal_join_points(out_hash1, out_hash2, off_point);
        }

        let op1 = out_pt1_index;
        let op2 = out_pt2_index;
        let mut op1b = self.out_rec.get_unique_pt(op1, true);
        let op2b = self.out_rec.get_unique_pt(op2, true);

        let reverse1 =
            self.t_edge
                .check_reverse(self.out_rec.point(op1), self.out_rec.point(op1b), off_point);
        if reverse1 {
            op1b = self.out_rec.get_unique_pt(op1, false);
            if self.t_edge.check_reverse(
                self.out_rec.point(op1),
                self.out_rec.point(op1b),
                off_point,
            ) {
                return default_result;
            }
        }

        let reverse2 =
            self.t_edge
                .check_reverse(self.out_rec.point(op2), self.out_rec.point(op2b), off_point);
        if reverse2 {
            let op2b = self.out_rec.get_unique_pt(op2, false);
            if self.t_edge.check_reverse(
                self.out_rec.point(op2),
                self.out_rec.point(op2b),
                off_point,
            ) {
                return default_result;
            }
        }

        if op1b == op1 || op2b == op2 || op1b == op2b || (is_records_same && reverse1 == reverse2) {
            return default_result;
        }

        let new_out_hash2 = join_u16(
            index2 as u16,
            self.out_rec
                .apply_join(out_pt1_index, out_pt2_index, reverse1) as u16,
        );

        (out_hash1, new_out_hash2, true)
    }

    fn horz_segments_overlap(
        &mut self,
        out_hash: u32,
        off_point: &Point<i32>,
        edge_index: usize,
    ) -> bool {
        let out_pt_index = get_u16(out_hash, 1) as usize;

        unsafe {
            let top = self.t_edge.top_lnk(edge_index) as *const Point<i32>;
            let bot = self.t_edge.bot_lnk(edge_index) as *const Point<i32>;
            Point::horz_segments_overlap(self.out_rec.point(out_pt_index), off_point, &*bot, &*top)
        }
    }
}
