use crate::clipper::constants::UNASSIGNED;
use crate::clipper::enums::{BoolCondition, ClipType, Direction, EdgeSide, PolyFillType, PolyType};
use crate::clipper::intersect_node::IntersectNode;
use crate::clipper::join::Join;
use crate::clipper::local_minima::LocalMinima;
use crate::clipper::out_rec::OutRec;
use crate::clipper::scanbeam::Scanbeam;
use crate::clipper::t_edge::TEdge;
use crate::clipper::utils::show_error;
use crate::geometry::point::Point;
use crate::utils::bit_ops::{get_u16, join_u16};

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

        let mut min_index: usize = UNASSIGNED;

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

    pub fn add_paths(&mut self, polygons: &Vec<Vec<Point<i32>>>, poly_type: PolyType) -> bool {
        let polygon_count: usize = polygons.len();
        let mut result: bool = false;

        for i in 0..polygon_count {
            if self.add_path(&polygons[i], poly_type) {
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

        let succeeded: bool;

        succeeded = self.execute_internal();
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
            self.join.reset();
            return false;
        }

        let mut bot_y: i32 = self.scanbeam.pop();
        let mut top_y: i32;

        loop {
            self.insert_local_minima_into_ael(bot_y);
            self.join.clear_ghosts();
            self.process_horizontals(false);

            if self.scanbeam.is_empty() {
                break;
            }

            top_y = self.scanbeam.pop();

            if !self.process_intersections(bot_y, top_y) {
                self.join.reset();
                return false;
            }

            self.process_edges_at_top_of_scanbeam(top_y);

            bot_y = top_y;

            if self.scanbeam.is_empty() && self.local_minima.is_empty() {
                break;
            }
        }

        self.out_rec.fix_directions();

        let join_count: usize = self.join.get_length(false);

        for i in 0..join_count {
            self.join_common_edge(i);
        }

        self.out_rec
            .fix_out_polygon(self.t_edge.is_use_full_range());

        self.join.reset();
        true
    }

    fn reset(&mut self) {
        self.scanbeam.clean();

        let minima_count = self.local_minima.length();

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
            self.scanbeam
                .insert(self.t_edge.get_y(result, EdgeSide::Top));
        }

        result
    }

    fn build_intersect_list(&mut self, bot_y: i32, top_y: i32) {
        if !self.t_edge.prepare_for_intersections(top_y) {
            return;
        }

        let mut is_modified: bool = true;
        let mut point = Point::new(Some(0), Some(0));

        while is_modified && self.t_edge.sorted != UNASSIGNED {
            is_modified = false;
            let mut curr_index = self.t_edge.sorted;

            while self.t_edge.next_sorted(curr_index) != UNASSIGNED {
                let next_index = self.t_edge.next_sorted(curr_index);

                unsafe {
                    point.set(0, 0);
                }

                if self.t_edge.check_condition(
                    curr_index,
                    next_index,
                    EdgeSide::Current,
                    EdgeSide::Current,
                    BoolCondition::Greater,
                    true,
                ) {
                    if self
                        .t_edge
                        .get_intersect_error(curr_index, next_index, &mut point)
                    {
                        show_error("Intersection error");
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

    fn intersect_edge_from_size(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        edge_index3: usize,
        side: EdgeSide,
        is_protect: bool,
    ) {
        let point = self.t_edge.point(edge_index3, side);
        self.intersect_edges(edge1_index, edge2_index, &point, is_protect);
    }

    fn intersect_edges(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        point: &Point<i32>,
        is_protect: bool,
    ) {
        if point.y == 54833 {
            eprintln!(
                "\n=== intersect_edges called with point=({}, {}) ===",
                point.x, point.y
            );
            eprintln!(
                "  edge1_index={}, edge2_index={}, is_protect={}",
                edge1_index, edge2_index, is_protect
            );
        }

        let edge1_stops: bool = self.t_edge.get_stop(edge1_index, point, is_protect);
        let edge2_stops: bool = self.t_edge.get_stop(edge2_index, point, is_protect);
        let edge1_contributing: bool = self.t_edge.is_assigned(edge1_index);
        let edge2_contributing: bool = self.t_edge.is_assigned(edge2_index);

        if self.t_edge.is_wind_deleta_empty(edge1_index)
            || self.t_edge.is_wind_deleta_empty(edge2_index)
        {
            self.intersect_open_edges(edge1_index, edge2_index, is_protect, point);
            return;
        }

        self.t_edge.align_wnd_count(edge1_index, edge2_index);

        let e1_wc: i32 = self.t_edge.get_wnd_type_filled(edge1_index);
        let e2_wc: i32 = self.t_edge.get_wnd_type_filled(edge2_index);

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

        let intersect_count: usize = self.intersections.length();

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

    fn intersect_open_edges(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        is_protect: bool,
        point: &Point<i32>,
    ) {
        let edge1_stops: bool = self.t_edge.get_stopped(edge1_index, point, is_protect);
        let edge2_stops: bool = self.t_edge.get_stopped(edge2_index, point, is_protect);
        let edge1_contributing: bool = self.t_edge.is_assigned(edge1_index);
        let edge2_contributing: bool = self.t_edge.is_assigned(edge2_index);
        let is_wind_delta_empty1: bool = self.t_edge.is_wind_deleta_empty(edge1_index);
        let is_wind_delta_empty2: bool = self.t_edge.is_wind_deleta_empty(edge2_index);

        if is_wind_delta_empty1 && is_wind_delta_empty2 {
            if (edge1_stops || edge2_stops) && edge1_contributing && edge2_contributing {
                self.add_local_max_poly(edge1_index, edge2_index, point);
            }
        } else {
            let edge_index = self.t_edge.get_intersect_index(edge1_index, edge2_index);

            if edge_index != UNASSIGNED {
                self.add_out_pt(edge_index, point);
                self.t_edge.unassign(edge_index);
            }
        }

        if edge1_stops {
            self.t_edge.delete_intersect_asignment(edge1_index);
        }

        if edge2_stops {
            self.t_edge.delete_intersect_asignment(edge2_index);
        }
    }

    fn out_pt_from_edge(&mut self, index: usize, side: EdgeSide, point_index: usize) -> usize {
        self.add_out_pt(index, &self.t_edge.point(point_index, side))
    }

    fn process_horizontal(&mut self, horz_edge_index: usize, is_top_of_scanbeam: bool) {
        let mut dir_value = self.t_edge.horz_direction(horz_edge_index);
        let mut dir: Direction = dir_value.0;
        let mut horz_left: i32 = dir_value.1;
        let mut horz_right: i32 = dir_value.2;
        let last_horz_index = self.t_edge.get_last_horizontal(horz_edge_index);
        let max_pair_index = self.t_edge.get_max_pair(last_horz_index);
        let mut horz_index = horz_edge_index;

        loop {
            let is_last_horz: bool = horz_index == last_horz_index;
            let mut curr_index =
                self.t_edge
                    .get_neighboar(horz_index, dir == Direction::Right, true);
            let is_right: bool = dir == Direction::Right;

            while curr_index != UNASSIGNED {
                if self
                    .t_edge
                    .is_intermediate_horizontal_end(curr_index, horz_index)
                {
                    break;
                }

                let next_index = self.t_edge.get_neighboar(curr_index, is_right, true);

                if (is_right && self.t_edge.get_x(curr_index, EdgeSide::Current) <= horz_right)
                    || (!is_right && self.t_edge.get_x(curr_index, EdgeSide::Current) >= horz_left)
                {
                    if self.t_edge.is_filled(horz_index) && is_top_of_scanbeam {
                        self.prepare_horz_joins(horz_index);
                    }

                    let index1 = if is_right { horz_index } else { curr_index };
                    let index2 = if is_right { curr_index } else { horz_index };

                    if curr_index == max_pair_index && is_last_horz {
                        self.intersect_edge_from_size(
                            index1,
                            index2,
                            curr_index,
                            EdgeSide::Top,
                            false,
                        );

                        if self.t_edge.is_assigned(max_pair_index) {
                            show_error("ProcessHorizontal error");
                        }

                        return;
                    }

                    let point = self.t_edge.point(curr_index, EdgeSide::Current);

                    self.intersect_edges(index1, index2, &point, true);

                    self.t_edge
                        .swap_positions_in_list(horz_index, curr_index, true);
                } else if (is_right
                    && self.t_edge.get_x(curr_index, EdgeSide::Current) >= horz_right)
                    || (!is_right && self.t_edge.get_x(curr_index, EdgeSide::Current) <= horz_left)
                {
                    break;
                }

                curr_index = next_index;
            }

            // IMPORTANT: Check is_filled on horz_index, not horz_edge_index
            // horz_index may have been updated in the loop and could be unassigned
            // This prevents calling prepare_horz_joins with an unassigned edge
            // which would cause index underflow in get_rect_data
            if self.t_edge.is_filled(horz_index) && is_top_of_scanbeam {
                self.prepare_horz_joins(horz_index);
            }

            if self.t_edge.has_next_local_minima(horz_index)
                && self
                    .t_edge
                    .is_horizontal(self.t_edge.get_next_local_minima(horz_index))
            {
                horz_index = self.update_edge_into_ael(horz_index);

                if self.t_edge.is_assigned(horz_index) {
                    self.out_pt_from_edge(horz_index, EdgeSide::Bottom, horz_index);
                }

                dir_value = self.t_edge.horz_direction(horz_index);
                dir = dir_value.0;
                horz_left = dir_value.1;
                horz_right = dir_value.2;
            } else {
                break;
            }
        }

        if self.t_edge.has_next_local_minima(horz_index) {
            if self.t_edge.is_assigned(horz_index) {
                let op1 = self.out_pt_from_edge(horz_index, EdgeSide::Top, horz_index);
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

                self.intersect_edge_from_size(index1, index2, horz_index, EdgeSide::Top, false);

                if self.t_edge.is_assigned(max_pair_index) {
                    show_error("ProcessHorizontal error");
                }

                return;
            }

            self.t_edge.delete_from_list(horz_index, true);
            self.t_edge.delete_from_list(max_pair_index, true);

            return;
        }

        self.delete_maxima(horz_index, false, horz_index);
    }

    fn delete_maxima(&mut self, max_index: usize, is_unassign: bool, edge_index: usize) {
        if self.t_edge.is_assigned(max_index) {
            self.out_pt_from_edge(max_index, EdgeSide::Top, edge_index);

            if is_unassign {
                self.t_edge.unassign(max_index);
            }
        }

        self.t_edge.delete_from_list(max_index, true);
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
        let mut edge_index: usize = self.t_edge.active;

        while edge_index != UNASSIGNED {
            if self.t_edge.get_maxima(edge_index, top_y) {
                let prev_index = self.t_edge.prev_active(edge_index);

                self.do_maxima(edge_index);

                edge_index = self.t_edge.get_current_active(edge_index, prev_index);
                continue;
            }

            if self.t_edge.get_intermediate(edge_index, top_y)
                && self
                    .t_edge
                    .is_horizontal(self.t_edge.get_next_local_minima(edge_index))
            {
                edge_index = self.update_edge_into_ael(edge_index);

                if self.t_edge.is_assigned(edge_index) {
                    self.out_pt_from_edge(edge_index, EdgeSide::Bottom, edge_index);
                }

                self.t_edge.add_edge_to_sel(edge_index);
            } else {
                self.t_edge.curr_from_top_x(edge_index, top_y);
            }

            if self.out_rec.strictly_simple() && self.t_edge.can_add_scanbeam(edge_index) {
                let point = self.t_edge.point(edge_index, EdgeSide::Current);
                let edge2_index = self.t_edge.prev_active(edge_index);
                let out_pt1 = self.out_pt_from_edge(edge2_index, EdgeSide::Current, edge_index);
                let out_pt2 = self.out_pt_from_edge(edge_index, EdgeSide::Current, edge_index);

                self.join.add(out_pt1, out_pt2, &point);
            }

            edge_index = self.t_edge.next_active(edge_index);
        }

        self.process_horizontals(true);

        edge_index = self.t_edge.active;

        while edge_index != UNASSIGNED {
            if self.t_edge.get_intermediate(edge_index, top_y) {
                let out_pt1 = if self.t_edge.is_assigned(edge_index) {
                    self.out_pt_from_edge(edge_index, EdgeSide::Top, edge_index)
                } else {
                    UNASSIGNED
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
            self.delete_maxima(edge_index, false, edge_index);

            return;
        }

        let mut next_edge_index: usize = self.t_edge.next_active(edge_index);

        while next_edge_index != UNASSIGNED
            && next_edge_index != self.t_edge.maxima_pair(edge_index)
        {
            self.intersect_edge_from_size(
                edge_index,
                next_edge_index,
                edge_index,
                EdgeSide::Top,
                true,
            );
            self.t_edge
                .swap_positions_in_list(edge_index, next_edge_index, true);
            next_edge_index = self.t_edge.next_active(edge_index);
        }

        let max_index = self.t_edge.maxima_pair(edge_index);

        if !self.t_edge.is_assigned(edge_index) && !self.t_edge.is_assigned(max_index) {
            self.t_edge.delete_from_list(edge_index, true);
            self.t_edge.delete_from_list(max_index, true);
        } else if self.t_edge.is_assigned(edge_index) && self.t_edge.is_assigned(max_index) {
            self.intersect_edge_from_size(edge_index, max_index, edge_index, EdgeSide::Top, false);
        } else if self.t_edge.is_wind_deleta_empty(edge_index) {
            self.delete_maxima(edge_index, true, edge_index);
            self.delete_maxima(max_index, true, edge_index);
        } else {
            show_error("DoMaxima error");
        }
    }

    fn process_intersect_list(&mut self) {
        let intersect_count: usize = self.intersections.length();
        let mut point = Point::new(Some(0), Some(0));

        for i in 0..intersect_count {
            let edge1_index: usize = self.intersections.get_edge1_index(i);
            let edge2_index: usize = self.intersections.get_edge2_index(i);
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

        if self.intersections.length() == 1 || self.fixup_intersection_order() {
            self.process_intersect_list();
        } else {
            self.t_edge.sorted = UNASSIGNED;
            self.intersections.clean();
            show_error("ProcessIntersections error");
            return false;
        }

        self.t_edge.sorted = UNASSIGNED;

        true
    }

    fn insert_local_minima_pt(
        &mut self,
        left_bound_index: usize,
        right_bound_index: usize,
    ) -> usize {
        let index = if left_bound_index != UNASSIGNED {
            left_bound_index
        } else {
            right_bound_index
        };

        if left_bound_index != UNASSIGNED && right_bound_index != UNASSIGNED {
            let point = self.t_edge.point(index, EdgeSide::Bottom);
            self.add_local_min_poly(left_bound_index, right_bound_index, &point)
        } else {
            self.out_pt_from_edge(index, EdgeSide::Bottom, index)
        }
    }

    fn insert_local_minima_into_ael(&mut self, bot_y: i32) {
        while let Some(min_y) = self.local_minima.min_y() {
            if min_y != bot_y {
                break;
            }
            let (left_bound_index, right_bound_index) = self.local_minima.pop();
            let out_pt = if self
                .t_edge
                .insert_local_minima_into_ael(left_bound_index, right_bound_index)
            {
                self.insert_local_minima_pt(left_bound_index, right_bound_index)
            } else {
                UNASSIGNED
            };

            if left_bound_index != UNASSIGNED {
                self.scanbeam
                    .insert(self.t_edge.get_y(left_bound_index, EdgeSide::Top));
            }

            if right_bound_index != UNASSIGNED {
                if self.t_edge.is_horizontal(right_bound_index) {
                    self.t_edge.add_edge_to_sel(right_bound_index);
                } else {
                    self.scanbeam
                        .insert(self.t_edge.get_y(right_bound_index, EdgeSide::Top));
                }
            }

            if left_bound_index == UNASSIGNED || right_bound_index == UNASSIGNED {
                continue;
            }

            if out_pt != UNASSIGNED
                && self.t_edge.is_horizontal(right_bound_index)
                && !self.t_edge.is_wind_deleta_empty(right_bound_index)
            {
                let join_count: usize = self.join.get_length(true);

                for i in 0..join_count {
                    let out_hash = self.join.get_hash1(i, true) as u32;
                    let out_pt_index = get_u16(out_hash, 1);
                    let join_x = self.join.get_x(i, true);
                    let join_y = self.join.get_y(i, true);
                    let out_rec_point = self.out_rec.point(out_pt_index as usize);

                    if self.t_edge.horz_segments_overlap(
                        &out_rec_point,
                        join_x,
                        join_y,
                        right_bound_index as i32,
                    ) {
                        self.join.from_ghost(i, out_pt);
                    }
                }
            }

            let condition = self.t_edge.can_join_left(left_bound_index);

            self.insert_join_from_edge(condition, out_pt, left_bound_index, false, true);

            if self.t_edge.next_active(left_bound_index) != right_bound_index {
                let condition = self.t_edge.can_join_right(right_bound_index);

                self.insert_join_from_edge(condition, out_pt, right_bound_index, false, true);

                if self.t_edge.next_active(left_bound_index) != UNASSIGNED {
                    let mut edge_index = self.t_edge.next_active(left_bound_index);

                    while edge_index != right_bound_index {
                        self.intersect_edge_from_size(
                            right_bound_index,
                            edge_index,
                            left_bound_index,
                            EdgeSide::Current,
                            false,
                        );
                        edge_index = self.t_edge.get_neighboar(edge_index, true, true);
                    }
                }
            }
        }
    }

    fn insert_join_from_edge(
        &mut self,
        condition: bool,
        out_hash1: usize,
        edge_index: usize,
        is_next: bool,
        is_top2: bool,
    ) -> bool {
        let point1 = self.t_edge.point(edge_index, EdgeSide::Bottom);
        let point2 = if is_top2 {
            self.t_edge.point(edge_index, EdgeSide::Top)
        } else {
            self.t_edge.point(edge_index, EdgeSide::Bottom)
        };

        self.insert_join(
            condition,
            out_hash1,
            self.t_edge.get_neighboar(edge_index, is_next, true),
            &point1,
            &point2,
        )
    }

    fn insert_join(
        &mut self,
        condition: bool,
        out_hash1: usize,
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

    fn prepare_horz_joins(&mut self, horz_edge_index: usize) {
        let (rec_index, side, top, bot) = self.t_edge.prepare_horz_joins(horz_edge_index);

        let (out_pt_hash, x, y) = self.out_rec.get_join_data(rec_index, side, &top, &bot);

        self.join.add_ghost(out_pt_hash as usize, x, y);
    }

    fn add_out_pt(&mut self, edge_index: usize, point: &Point<i32>) -> usize {
        let out_rec_index: usize;
        let point_index: usize;

        if !self.t_edge.is_assigned(edge_index) {
            point_index = self.out_rec.from_point(point);
            out_rec_index = self.out_rec.create(point_index);

            let (is_hole, index) = self
                .t_edge
                .get_hole_state(self.out_rec.first_left_index(out_rec_index), edge_index);

            self.out_rec.set_hole_state(out_rec_index, is_hole, index);

            self.t_edge.set_rec_index(
                edge_index,
                self.out_rec.current_index(out_rec_index) as usize,
            );
        } else {
            let is_to_front: bool = self.t_edge.side(edge_index) == Direction::Left;
            let rec_index = self.t_edge.get_rec_index(edge_index);

            out_rec_index = self.out_rec.get_out_rec(rec_index);
            point_index = self.out_rec.add_out_pt(rec_index, is_to_front, point);
        }

        self.out_rec.get_hash(out_rec_index, point_index) as usize
    }

    fn add_local_min_poly(
        &mut self,
        edge1_index: usize,
        edge2_index: usize,
        point: &Point<i32>,
    ) -> usize {
        let mut first_index = edge2_index;
        let mut second_index = edge1_index;

        if self.t_edge.is_horizontal(edge2_index)
            || self.t_edge.dx(edge1_index) > self.t_edge.dx(edge2_index)
        {
            first_index = edge1_index;
            second_index = edge2_index;
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

        let condition = rec_index1 < rec_index2;
        let first_index = if condition { edge1_index } else { edge2_index };
        let second_index = if condition { edge2_index } else { edge1_index };
        let first_rec_index = self.t_edge.get_rec_index(first_index);
        let second_rec_index = self.t_edge.get_rec_index(second_index);

        let first_side = self.t_edge.side(first_index);
        let second_side = self.t_edge.side(second_index);

        self.t_edge.add_local_max_poly(first_index, second_index);
        self.out_rec
            .join_polys(first_rec_index, second_rec_index, first_side, second_side);
    }

    fn join_common_edge(&mut self, index: usize) {
        let mut off_point = Point::new(
            Some(self.join.get_x(index, false)),
            Some(self.join.get_y(index, false)),
        );
        let input_hash1 = self.join.get_hash1(index, false);
        let input_hash2 = self.join.get_hash2(index);
        let (out_hash1, out_hash2, result) =
            self.join_points(input_hash1, input_hash2, &mut off_point);

        if !result {
            self.join.update_hash(index, out_hash1, out_hash2);
            return;
        }

        let index1: usize = get_u16(out_hash1 as u32, 0) as usize;
        let index2: usize = get_u16(out_hash2 as u32, 0) as usize;
        let out_pt1_index: usize = get_u16(out_hash1 as u32, 1) as usize;
        let out_pt2_index: usize = get_u16(out_hash2 as u32, 1) as usize;
        let out_rec1: usize = self.out_rec.get_out_rec(index1);

        if index1 == index2 {
            let _out_rec2 = self
                .out_rec
                .split_polys(out_rec1, out_pt1_index, out_pt2_index);

            self.join.update_hash(index, out_hash1, out_hash2);
            return;
        }

        let out_rec2: usize = self.out_rec.get_out_rec(index2);
        self.out_rec.join_polys2(out_rec1, out_rec2);

        self.join.update_hash(index, out_hash1, out_hash2);
    }

    fn join_points(
        &mut self,
        out_hash1: usize,
        out_hash2: usize,
        off_point: &mut Point<i32>,
    ) -> (usize, usize, bool) {
        let index1: usize = get_u16(out_hash1 as u32, 0) as usize;
        let index2: usize = get_u16(out_hash2 as u32, 0) as usize;
        let out_rec1 = self.out_rec.get_out_rec(index1);
        let out_rec2 = self.out_rec.get_out_rec(index2);

        if self.out_rec.is_unassigned(out_rec1) || self.out_rec.is_unassigned(out_rec2) {
            return (out_hash1, out_hash2, false);
        }

        let out_pt1_index: usize = get_u16(out_hash1 as u32, 1) as usize;
        let out_pt2_index: usize = get_u16(out_hash2 as u32, 1) as usize;
        let is_records_same = out_rec1 == out_rec2;

        let is_horizontal: bool = self.out_rec.point_y(out_pt1_index) == off_point.y;

        if is_horizontal {
            let (h1, h2, result) =
                self.out_rec
                    .horizontal_join_points(out_hash1 as u32, out_hash2 as u32, off_point);
            return (h1 as usize, h2 as usize, result);
        }

        let op1 = out_pt1_index;
        let op2 = out_pt2_index;
        let mut op1b: usize = self.out_rec.get_unique_pt(op1, true);
        let mut op2b: usize = self.out_rec.get_unique_pt(op2, true);

        let reverse1: bool =
            self.out_rec
                .check_reverse(op1, op1b, off_point, self.t_edge.is_use_full_range());

        if reverse1 {
            op1b = self.out_rec.get_unique_pt(op1, false);

            if self
                .out_rec
                .check_reverse(op1, op1b, off_point, self.t_edge.is_use_full_range())
            {
                return (out_hash1, out_hash2, false);
            }
        }

        let reverse2: bool =
            self.out_rec
                .check_reverse(op2, op2b, off_point, self.t_edge.is_use_full_range());

        if reverse2 {
            op2b = self.out_rec.get_unique_pt(op2, false);

            if self
                .out_rec
                .check_reverse(op2, op2b, off_point, self.t_edge.is_use_full_range())
            {
                return (out_hash1, out_hash2, false);
            }
        }

        if op1b == op1 || op2b == op2 || op1b == op2b || (is_records_same && reverse1 == reverse2) {
            return (out_hash1, out_hash2, false);
        }

        let new_out_hash2 = join_u16(
            index2 as u16,
            self.out_rec
                .apply_join(out_pt1_index, out_pt2_index, reverse1) as u16,
        ) as usize;

        (out_hash1, new_out_hash2, true)
    }
}
