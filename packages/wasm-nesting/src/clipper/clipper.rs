use crate::clipper::clipper_base::ClipperBase;
use crate::clipper::enums::{ClipType, Direction, PolyFillType, PolyType};
use crate::clipper::intersect_node::IntersectNode;
use crate::clipper::join::Join;
use crate::clipper::out_pt::OutPt;
use crate::clipper::out_rec::OutRec;
use crate::clipper::scanbeam::Scanbeam;
use crate::clipper::t_edge::TEdge;
use crate::geometry::point::Point;

pub struct Clipper {
    pub base: ClipperBase,
    pub clip_type: ClipType,
    pub fill_type: PolyFillType,
    pub scanbeam: *mut Scanbeam,
    pub active_edges: *mut TEdge,
    pub sorted_edges: *mut TEdge,
    pub intersections: Vec<*mut IntersectNode>,
    pub is_execute_locked: bool,
    pub poly_outs: Vec<*mut OutRec>,
    pub joins: Vec<*mut Join>,
    pub ghost_joins: Vec<*mut Join>,
    pub reverse_solution: bool,
    pub strictly_simple: bool,
}

impl Clipper {
    pub fn new() -> Self {
        Self {
            base: ClipperBase::new(),
            clip_type: ClipType::Union,
            fill_type: PolyFillType::NonZero,
            scanbeam: std::ptr::null_mut(),
            active_edges: std::ptr::null_mut(),
            sorted_edges: std::ptr::null_mut(),
            intersections: Vec::new(),
            is_execute_locked: false,
            poly_outs: Vec::new(),
            joins: Vec::new(),
            ghost_joins: Vec::new(),
            reverse_solution: false,
            strictly_simple: false,
        }
    }

    pub unsafe fn execute(
        &mut self,
        clip_type: ClipType,
        solution: &mut Vec<Vec<Point<i32>>>,
        fill_type: PolyFillType,
    ) -> bool {
        if self.is_execute_locked {
            return false;
        }

        self.is_execute_locked = true;
        self.fill_type = fill_type;
        self.clip_type = clip_type;
        solution.clear();

        let mut succeeded = false;

        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            succeeded = self.execute_internal();
            if succeeded {
                self.build_result(solution);
            }
        }));

        self.dispose_all_poly_pts();
        self.is_execute_locked = false;

        if result.is_err() {
            false
        } else {
            succeeded
        }
    }

    pub unsafe fn execute_internal(&mut self) -> bool {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            self.reset();

            if self.base.current_lm.is_null() {
                return false;
            }

            let mut bot_y = self.pop_scanbeam();
            let mut top_y;

            loop {
                self.insert_local_minima_into_ael(bot_y);
                self.ghost_joins.clear();
                self.process_horizontals(false);

                if self.scanbeam.is_null() {
                    break;
                }

                top_y = self.pop_scanbeam();

                if !self.process_intersections(bot_y, top_y) {
                    return false;
                }

                self.process_edges_at_top_of_scanbeam(top_y);

                bot_y = top_y;

                if self.scanbeam.is_null() && self.base.current_lm.is_null() {
                    break;
                }
            }

            // fix orientations
            let out_rec_count = self.poly_outs.len();
            for i in 0..out_rec_count {
                let out_rec = self.poly_outs[i];

                if (*out_rec).is_empty() {
                    continue;
                }

                if ((*out_rec).is_hole != self.reverse_solution) == ((*out_rec).area() > 0.0) {
                    (*out_rec).reverse_pts();
                }
            }

            // join edges
            let join_count = self.joins.len();
            for i in 0..join_count {
                (*self.joins[i]).join_common_edges(
                    &mut self.poly_outs,
                    self.base.is_use_full_range,
                    self.reverse_solution,
                );
            }

            // fixup output polygons
            let out_rec_count = self.poly_outs.len();
            for i in 0..out_rec_count {
                let out_rec = self.poly_outs[i];
                if !(*out_rec).is_empty() {
                    (*out_rec).fixup_out_polygon(false, self.base.is_use_full_range);
                }
            }

            if self.strictly_simple {
                self.do_simple_polygons();
            }

            true
        }));

        self.joins.clear();
        self.ghost_joins.clear();

        result.unwrap_or(false)
    }

    pub unsafe fn process_edges_at_top_of_scanbeam(&mut self, top_y: i32) {
        let mut edge1 = self.active_edges;
        let mut edge2: *mut TEdge;
        let mut is_maxima_edge: bool;
        let mut out_pt1: *mut OutPt;
        let mut out_pt2: *mut OutPt;

        while !edge1.is_null() {
            is_maxima_edge = (*edge1).get_maxima(top_y);

            if is_maxima_edge {
                edge2 = (*edge1).maxima_pair();
                is_maxima_edge = edge2.is_null() || !(*edge2).is_horizontal();
            }

            if is_maxima_edge {
                edge2 = (*edge1).prev_in_ael;
                self.do_maxima(edge1);
                edge1 = if edge2.is_null() {
                    self.active_edges
                } else {
                    (*edge2).next_in_ael
                };
            } else {
                if (*edge1).get_intermediate(top_y)
                    && !(*edge1).next_in_lml.is_null()
                    && (*(*edge1).next_in_lml).is_horizontal()
                {
                    edge1 = self.update_edge_into_ael(edge1);

                    if (*edge1).is_assigned() {
                        OutRec::add_out_pt(&mut self.poly_outs, edge1, &(*edge1).bot);
                    }

                    self.sorted_edges = (*edge1).add_edge_to_sel(self.sorted_edges);
                } else {
                    (*edge1)
                        .curr
                        .set((*edge1).top_x(top_y) as i32, top_y as i32);
                }

                if self.strictly_simple {
                    edge2 = (*edge1).prev_in_ael;
                    if (*edge1).is_filled()
                        && !edge2.is_null()
                        && (*edge2).is_filled()
                        && (*edge2).curr.x == (*edge1).curr.x
                    {
                        out_pt1 = OutRec::add_out_pt(&mut self.poly_outs, edge2, &(*edge1).curr);
                        out_pt2 = OutRec::add_out_pt(&mut self.poly_outs, edge1, &(*edge1).curr);
                        self.joins
                            .push(Join::create(out_pt1, out_pt2, Some(&(*edge1).curr)));
                    }
                }

                edge1 = (*edge1).next_in_ael;
            }
        }

        self.process_horizontals(true);

        edge1 = self.active_edges;

        while !edge1.is_null() {
            if (*edge1).get_intermediate(top_y) {
                out_pt1 = if (*edge1).is_assigned() {
                    OutRec::add_out_pt(&mut self.poly_outs, edge1, &(*edge1).top)
                } else {
                    std::ptr::null_mut()
                };

                edge1 = self.update_edge_into_ael(edge1);

                let e_prev = (*edge1).prev_in_ael;
                let e_next = (*edge1).next_in_ael;

                if !out_pt1.is_null()
                    && !e_prev.is_null()
                    && (*e_prev).curr.almost_equal(&(*edge1).bot, None)
                    && (*e_prev).is_filled()
                    && (*e_prev).curr.y > (*e_prev).top.y
                    && TEdge::slopes_equal(edge1, e_prev, self.base.is_use_full_range)
                    && !(*edge1).is_wind_delta_empty()
                {
                    out_pt2 = OutRec::add_out_pt(&mut self.poly_outs, e_prev, &(*edge1).bot);
                    self.joins
                        .push(Join::create(out_pt1, out_pt2, Some(&(*edge1).top)));
                } else if !out_pt1.is_null()
                    && !e_next.is_null()
                    && (*e_next).curr.almost_equal(&(*edge1).bot, None)
                    && (*e_next).is_filled()
                    && (*e_next).curr.y > (*e_next).top.y
                    && TEdge::slopes_equal(edge1, e_next, self.base.is_use_full_range)
                    && !(*edge1).is_wind_delta_empty()
                {
                    out_pt2 = OutRec::add_out_pt(&mut self.poly_outs, e_next, &(*edge1).bot);
                    self.joins
                        .push(Join::create(out_pt1, out_pt2, Some(&(*edge1).top)));
                }
            }

            edge1 = (*edge1).next_in_ael;
        }
    }

    pub unsafe fn do_maxima(&mut self, edge: *mut TEdge) {
        let max_pair_edge = (*edge).maxima_pair();

        if max_pair_edge.is_null() {
            if (*edge).is_assigned() {
                OutRec::add_out_pt(&mut self.poly_outs, edge, &(*edge).top);
            }

            self.active_edges = (*edge).delete_from_ael(self.active_edges);
            return;
        }

        let mut next_edge = (*edge).next_in_ael;

        while !next_edge.is_null() && next_edge != max_pair_edge {
            self.intersect_edges(edge, next_edge, &(*edge).top, true);
            self.swap_positions_in_ael(edge, next_edge);
            next_edge = (*edge).next_in_ael;
        }

        if !(*edge).is_assigned() && !(*max_pair_edge).is_assigned() {
            self.active_edges = (*edge).delete_from_ael(self.active_edges);
            self.active_edges = (*max_pair_edge).delete_from_ael(self.active_edges);
        } else if (*edge).is_assigned() && (*max_pair_edge).is_assigned() {
            self.intersect_edges(edge, max_pair_edge, &(*edge).top, false);
        } else if (*edge).is_wind_delta_empty() {
            if (*edge).is_assigned() {
                OutRec::add_out_pt(&mut self.poly_outs, edge, &(*edge).top);
                (*edge).unassign();
            }

            self.active_edges = (*edge).delete_from_ael(self.active_edges);

            if (*max_pair_edge).is_assigned() {
                OutRec::add_out_pt(&mut self.poly_outs, max_pair_edge, &(*edge).top);
                (*max_pair_edge).unassign();
            }

            self.active_edges = (*max_pair_edge).delete_from_ael(self.active_edges);
        } else {
            //show_error("DoMaxima error");
        }
    }

    pub unsafe fn insert_local_minima_into_ael(&mut self, bot_y: i32) {
        let mut left_bound: *mut TEdge;
        let mut right_bound: *mut TEdge;
        let mut out_pt: *mut OutPt;

        while !self.base.current_lm.is_null() && (*self.base.current_lm).y == bot_y {
            left_bound = (*self.base.current_lm).left_bound;
            right_bound = (*self.base.current_lm).right_bound;
            out_pt = std::ptr::null_mut();

            self.base.current_lm = (*self.base.current_lm).next;

            if left_bound.is_null() {
                self.active_edges = (*right_bound).insert_edge_into_ael(self.active_edges, None);
                (*right_bound).set_winding_count(self.active_edges, self.clip_type);

                if (*right_bound).get_contributing(self.clip_type, self.fill_type) {
                    out_pt =
                        OutRec::add_out_pt(&mut self.poly_outs, right_bound, &(*right_bound).bot);
                }
            } else if right_bound.is_null() {
                self.active_edges = (*left_bound).insert_edge_into_ael(self.active_edges, None);
                (*left_bound).set_winding_count(self.active_edges, self.clip_type);

                if (*left_bound).get_contributing(self.clip_type, self.fill_type) {
                    out_pt =
                        OutRec::add_out_pt(&mut self.poly_outs, left_bound, &(*left_bound).bot);
                }

                self.scanbeam = Scanbeam::insert((*left_bound).top.y, self.scanbeam);
            } else {
                self.active_edges = (*left_bound).insert_edge_into_ael(self.active_edges, None);
                self.active_edges =
                    (*right_bound).insert_edge_into_ael(self.active_edges, Some(left_bound));

                (*left_bound).set_winding_count(self.active_edges, self.clip_type);

                (*right_bound).wind_cnt = (*left_bound).wind_cnt;
                (*right_bound).wind_cnt2 = (*left_bound).wind_cnt2;

                if (*left_bound).get_contributing(self.clip_type, self.fill_type) {
                    out_pt = self.add_local_min_poly(left_bound, right_bound, &(*left_bound).bot);
                }

                self.scanbeam = Scanbeam::insert((*left_bound).top.y, self.scanbeam);
            }

            if !right_bound.is_null() {
                if (*right_bound).is_horizontal() {
                    self.sorted_edges = (*right_bound).add_edge_to_sel(self.sorted_edges);
                } else {
                    self.scanbeam = Scanbeam::insert((*right_bound).top.y, self.scanbeam);
                }
            }

            if left_bound.is_null() || right_bound.is_null() {
                continue;
            }

            if !out_pt.is_null()
                && (*right_bound).is_horizontal()
                && !(*right_bound).is_wind_delta_empty()
                && !self.ghost_joins.is_empty()
            {
                for join in &self.ghost_joins {
                    if Point::<i32>::horz_segments_overlap(
                        &(*(**join).out_pt1).point,
                        &(**join).off_pt,
                        &(*right_bound).bot,
                        &(*right_bound).top,
                    ) {
                        self.joins.push(Join::create(
                            (**join).out_pt1,
                            out_pt,
                            Some(&(**join).off_pt),
                        ));
                    }
                }
            }

            if (*left_bound).is_filled()
                && !(*left_bound).prev_in_ael.is_null()
                && (*(*left_bound).prev_in_ael).curr.x == (*left_bound).bot.x
                && (*(*left_bound).prev_in_ael).is_filled()
                && TEdge::slopes_equal(
                    (*left_bound).prev_in_ael,
                    left_bound,
                    self.base.is_use_full_range,
                )
            {
                let op2 = OutRec::add_out_pt(
                    &mut self.poly_outs,
                    (*left_bound).prev_in_ael,
                    &(*left_bound).bot,
                );
                self.joins
                    .push(Join::create(out_pt, op2, Some(&(*left_bound).top)));
            }

            if (*left_bound).next_in_ael != right_bound {
                if (*right_bound).is_filled()
                    && !(*right_bound).prev_in_ael.is_null()
                    && (*(*right_bound).prev_in_ael).is_filled()
                    && TEdge::slopes_equal(
                        (*right_bound).prev_in_ael,
                        right_bound,
                        self.base.is_use_full_range,
                    )
                {
                    let op2 = OutRec::add_out_pt(
                        &mut self.poly_outs,
                        (*right_bound).prev_in_ael,
                        &(*right_bound).bot,
                    );
                    self.joins
                        .push(Join::create(out_pt, op2, Some(&(*right_bound).top)));
                }

                let mut edge = (*left_bound).next_in_ael;
                while !edge.is_null() && edge != right_bound {
                    self.intersect_edges(right_bound, edge, &(*left_bound).curr, false);
                    edge = (*edge).next_in_ael;
                }
            }
        }
    }

    pub unsafe fn process_intersections(&mut self, bot_y: i32, top_y: i32) -> bool {
        if self.active_edges.is_null() {
            return true;
        }

        // Rust не має try-catch як у JS, тому обмежимось логікою без паніки
        self.build_intersect_list(bot_y, top_y);

        if self.intersections.is_empty() {
            return true;
        }

        let result = if self.intersections.len() == 1 || self.fixup_intersection_order() {
            self.process_intersect_list();
            true
        } else {
            false
        };

        self.sorted_edges = std::ptr::null_mut();
        result
    }

    pub unsafe fn process_intersect_list(&mut self) {
        let intersect_count = self.intersections.len();

        for i in 0..intersect_count {
            let node = self.intersections[i];

            self.intersect_edges((*node).edge1, (*node).edge2, &(*node).pt, true);
            self.swap_positions_in_ael((*node).edge1, (*node).edge2);
        }

        self.intersections.clear();
    }

    pub unsafe fn intersect_edges(
        &mut self,
        edge1: *mut TEdge,
        edge2: *mut TEdge,
        point: *const Point<i32>,
        is_protect: bool,
    ) {
        let edge1_stops =
            !is_protect && (*edge1).next_in_lml.is_null() && (*edge1).top.almost_equal(point, None);
        let edge2_stops =
            !is_protect && (*edge2).next_in_lml.is_null() && (*edge2).top.almost_equal(point, None);

        let edge1_contributing = (*edge1).is_assigned();
        let edge2_contributing = (*edge2).is_assigned();

        // If either edge is an open path
        if (*edge1).is_wind_delta_empty() || (*edge2).is_wind_delta_empty() {
            // Both are open
            if (*edge1).is_wind_delta_empty() && (*edge2).is_wind_delta_empty() {
                if (edge1_stops || edge2_stops) && edge1_contributing && edge2_contributing {
                    OutRec::add_local_max_poly(
                        &mut self.poly_outs,
                        edge1,
                        edge2,
                        point,
                        self.active_edges,
                    );
                }
            } else if (*edge1).poly_typ == (*edge2).poly_typ
                && (*edge1).wind_delta != (*edge2).wind_delta
                && self.clip_type == ClipType::Union
            {
                if (*edge1).is_wind_delta_empty() && edge2_contributing {
                    OutRec::add_out_pt(&mut self.poly_outs, edge1, point);
                    if edge1_contributing {
                        (*edge1).unassign();
                    }
                } else if edge1_contributing {
                    OutRec::add_out_pt(&mut self.poly_outs, edge2, point);
                    if edge2_contributing {
                        (*edge2).unassign();
                    }
                }
            } else if (*edge1).poly_typ != (*edge2).poly_typ {
                if (*edge1).is_wind_delta_empty()
                    && (*edge2).wind_cnt.abs() == 1
                    && (self.clip_type != ClipType::Union || (*edge2).wind_cnt2 == 0)
                {
                    OutRec::add_out_pt(&mut self.poly_outs, edge1, point);
                    if edge1_contributing {
                        (*edge1).unassign();
                    }
                } else if (*edge2).is_wind_delta_empty()
                    && (*edge1).wind_cnt.abs() == 1
                    && (self.clip_type != ClipType::Union || (*edge1).wind_cnt2 == 0)
                {
                    OutRec::add_out_pt(&mut self.poly_outs, edge2, point);
                    if edge2_contributing {
                        (*edge2).unassign();
                    }
                }
            }

            if edge1_stops {
                if !(*edge1).is_assigned() {
                    self.active_edges = (*edge1).delete_from_ael(self.active_edges);
                } else {
                    //show_error("Error intersecting polylines");
                }
            }

            if edge2_stops {
                if !(*edge2).is_assigned() {
                    self.active_edges = (*edge2).delete_from_ael(self.active_edges);
                } else {
                    //show_error("Error intersecting polylines");
                }
            }

            return;
        }

        // Winding count updates
        if (*edge1).poly_typ == (*edge2).poly_typ {
            (*edge1).wind_cnt = if (*edge1).wind_cnt == -(*edge2).wind_delta {
                -(*edge1).wind_cnt
            } else {
                (*edge1).wind_cnt + (*edge2).wind_delta
            };
            (*edge2).wind_cnt = if (*edge2).wind_cnt == (*edge1).wind_delta {
                -(*edge2).wind_cnt
            } else {
                (*edge2).wind_cnt - (*edge1).wind_delta
            };
        } else {
            (*edge1).wind_cnt2 += (*edge2).wind_delta;
            (*edge2).wind_cnt2 -= (*edge1).wind_delta;
        }

        let (e1_wc, e2_wc) = match self.fill_type {
            PolyFillType::Positive => ((*edge1).wind_cnt, (*edge2).wind_cnt),
            PolyFillType::Negative => (-(*edge1).wind_cnt, -(*edge2).wind_cnt),
            _ => ((*edge1).wind_cnt.abs(), (*edge2).wind_cnt.abs()),
        };

        if edge1_contributing && edge2_contributing {
            if edge1_stops
                || edge2_stops
                || e1_wc != 1
                || e2_wc != 1
                || (*edge1).poly_typ != (*edge2).poly_typ
            {
                OutRec::add_local_max_poly(
                    &mut self.poly_outs,
                    edge1,
                    edge2,
                    point,
                    self.active_edges,
                );
            } else {
                OutRec::add_out_pt(&mut self.poly_outs, edge1, point);
                OutRec::add_out_pt(&mut self.poly_outs, edge2, point);
                TEdge::swap_sides(edge1, edge2);
                TEdge::swap_poly_indexes(edge1, edge2);
            }
        } else if edge1_contributing {
            if e2_wc == 0 || e2_wc == 1 {
                OutRec::add_out_pt(&mut self.poly_outs, edge1, point);
                TEdge::swap_sides(edge1, edge2);
                TEdge::swap_poly_indexes(edge1, edge2);
            }
        } else if edge2_contributing {
            if e1_wc == 0 || e1_wc == 1 {
                OutRec::add_out_pt(&mut self.poly_outs, edge2, point);
                TEdge::swap_sides(edge1, edge2);
                TEdge::swap_poly_indexes(edge1, edge2);
            }
        } else if (e1_wc == 0 || e1_wc == 1)
            && (e2_wc == 0 || e2_wc == 1)
            && !edge1_stops
            && !edge2_stops
        {
            let (e1_wc2, e2_wc2) = match self.fill_type {
                PolyFillType::Positive => ((*edge1).wind_cnt2, (*edge2).wind_cnt2),
                PolyFillType::Negative => (-(*edge1).wind_cnt2, -(*edge2).wind_cnt2),
                _ => ((*edge1).wind_cnt2.abs(), (*edge2).wind_cnt2.abs()),
            };

            if (*edge1).poly_typ != (*edge2).poly_typ {
                self.add_local_min_poly(edge1, edge2, point);
            } else if e1_wc == 1 && e2_wc == 1 {
                match self.clip_type {
                    ClipType::Union if e1_wc2 <= 0 && e2_wc2 <= 0 => {
                        self.add_local_min_poly(edge1, edge2, point);
                    }
                    ClipType::Difference => {
                        if ((*edge1).poly_typ == PolyType::Clip && e1_wc2.min(e2_wc2) > 0)
                            || ((*edge1).poly_typ == PolyType::Subject && e1_wc2.max(e2_wc2) <= 0)
                        {
                            self.add_local_min_poly(edge1, edge2, point);
                        }
                    }
                    _ => {}
                }
            } else {
                TEdge::swap_sides(edge1, edge2);
            }
        }

        if edge1_stops != edge2_stops
            && ((edge1_stops && (*edge1).is_assigned()) || (edge2_stops && (*edge2).is_assigned()))
        {
            TEdge::swap_sides(edge1, edge2);
            TEdge::swap_poly_indexes(edge1, edge2);
        }

        if edge1_stops {
            self.active_edges = (*edge1).delete_from_ael(self.active_edges);
        }
        if edge2_stops {
            self.active_edges = (*edge2).delete_from_ael(self.active_edges);
        }
    }

    pub unsafe fn add_local_min_poly(
        &mut self,
        edge1: *mut TEdge,
        edge2: *mut TEdge,
        point: *const Point<i32>,
    ) -> *mut OutPt {
        let result: *mut OutPt;
        let edge: *mut TEdge;
        let edge_prev: *mut TEdge;

        if (*edge2).is_horizontal() || (*edge1).dx > (*edge2).dx {
            result = OutRec::add_out_pt(&mut self.poly_outs, edge1, point);
            (*edge2).index = (*edge1).index;
            (*edge2).side = Direction::Right;
            (*edge1).side = Direction::Left;
            edge = edge1;
            edge_prev = if std::ptr::eq((*edge).prev_in_ael, edge2) {
                (*edge2).prev_in_ael
            } else {
                (*edge).prev_in_ael
            };
        } else {
            result = OutRec::add_out_pt(&mut self.poly_outs, edge2, point);
            (*edge1).index = (*edge2).index;
            (*edge1).side = Direction::Right;
            (*edge2).side = Direction::Left;
            edge = edge2;
            edge_prev = if std::ptr::eq((*edge).prev_in_ael, edge1) {
                (*edge1).prev_in_ael
            } else {
                (*edge).prev_in_ael
            };
        }

        if !edge_prev.is_null()
            && (*edge_prev).is_filled()
            && (*edge_prev).top_x((*point).y) == (*edge).top_x((*point).y)
            && TEdge::slopes_equal(edge, edge_prev, self.base.is_use_full_range)
            && !(*edge).is_wind_delta_empty()
        {
            let out_pt = OutRec::add_out_pt(&mut self.poly_outs, edge_prev, point);
            self.joins
                .push(Join::create(result, out_pt, Some(&(*edge).top)));
        }

        result
    }

    unsafe fn build_result(&self, polygons: &mut Vec<Vec<Point<i32>>>) {
        let polygon_count = self.poly_outs.len();

        for i in 0..polygon_count {
            let out_rec = self.poly_outs[i];
            let polygon = (*out_rec).export();

            if let Some(result) = polygon {
                polygons.push(result);
            }
        }
    }

    unsafe fn reset(&mut self) {
        self.base.reset();

        self.scanbeam = if !self.base.minima_list.is_null() {
            (*self.base.minima_list).get_scanbeam()
        } else {
            std::ptr::null_mut()
        };
        self.active_edges = std::ptr::null_mut();
        self.sorted_edges = std::ptr::null_mut();
    }

    unsafe fn pop_scanbeam(&mut self) -> i32 {
        let result = (*self.scanbeam).y;

        self.scanbeam = (*self.scanbeam).next;

        result
    }

    unsafe fn dispose_all_poly_pts(&mut self) {
        for out_rec in &mut self.poly_outs {
            if !out_rec.is_null() {
                (**out_rec).dispose();
            }
        }

        self.poly_outs.clear();
    }

    unsafe fn process_horizontals(&mut self, is_top_of_scanbeam: bool) {
        let mut horz_edge = self.sorted_edges;

        while !horz_edge.is_null() {
            self.sorted_edges = (*horz_edge).delete_from_sel(self.sorted_edges);
            self.process_horizontal(horz_edge, is_top_of_scanbeam);
            horz_edge = self.sorted_edges;
        }
    }

    unsafe fn process_horizontal(&mut self, mut horz_edge: *mut TEdge, is_top_of_scanbeam: bool) {
        let (mut dir, mut horz_left, mut horz_right) = (*horz_edge).horz_direction();
        let mut e_last_horz = horz_edge;
        let mut e_max_pair: *mut TEdge = std::ptr::null_mut();

        while !(*e_last_horz).next_in_lml.is_null() && (*(*e_last_horz).next_in_lml).is_horizontal()
        {
            e_last_horz = (*e_last_horz).next_in_lml;
        }

        if (*e_last_horz).next_in_lml.is_null() {
            e_max_pair = (*e_last_horz).maxima_pair();
        }

        loop {
            let is_last_horz = std::ptr::eq(horz_edge, e_last_horz);
            let mut e = (*horz_edge).get_next_in_ael(dir);
            let mut e_next: *mut TEdge;

            while !e.is_null() {
                if (*e).curr.x == (*horz_edge).top.x
                    && !(*horz_edge).next_in_lml.is_null()
                    && (*e).dx < (*(*horz_edge).next_in_lml).dx
                {
                    break;
                }

                e_next = (*e).get_next_in_ael(dir);

                if (dir == Direction::Right && (*e).curr.x <= horz_right)
                    || (dir == Direction::Left && (*e).curr.x >= horz_left)
                {
                    if (*horz_edge).is_filled() {
                        self.prepare_horz_joins(horz_edge, is_top_of_scanbeam);
                    }

                    if std::ptr::eq(e, e_max_pair) && is_last_horz {
                        if dir == Direction::Right {
                            self.intersect_edges(horz_edge, e, &(*e).top, false);
                        } else {
                            self.intersect_edges(e, horz_edge, &(*e).top, false);
                        }

                        if (*e_max_pair).is_assigned() {
                            // show_error("ProcessHorizontal error");
                        }

                        return;
                    }

                    let pt = Point::<i32>::new(Some((*e).curr.x), Some((*horz_edge).curr.y));

                    if dir == Direction::Right {
                        self.intersect_edges(horz_edge, e, &pt, true);
                    } else {
                        self.intersect_edges(e, horz_edge, &pt, true);
                    }

                    self.swap_positions_in_ael(horz_edge, e);
                } else if (dir == Direction::Right && (*e).curr.x >= horz_right)
                    || (dir == Direction::Left && (*e).curr.x <= horz_left)
                {
                    break;
                }

                e = e_next;
            }

            if (*horz_edge).is_filled() {
                self.prepare_horz_joins(horz_edge, is_top_of_scanbeam);
            }

            if !(*horz_edge).next_in_lml.is_null() && (*(*horz_edge).next_in_lml).is_horizontal() {
                horz_edge = self.update_edge_into_ael(horz_edge);

                if (*horz_edge).is_assigned() {
                    OutRec::add_out_pt(&mut self.poly_outs, horz_edge, &(*horz_edge).bot);
                }

                let dir_result = (*horz_edge).horz_direction();
                dir = dir_result.0;
                horz_left = dir_result.1;
                horz_right = dir_result.2;
            } else {
                break;
            }
        }

        if !(*horz_edge).next_in_lml.is_null() {
            if (*horz_edge).is_assigned() {
                let op1 = OutRec::add_out_pt(&mut self.poly_outs, horz_edge, &(*horz_edge).top);
                horz_edge = self.update_edge_into_ael(horz_edge);

                if (*horz_edge).is_wind_delta_empty() {
                    return;
                }

                let prev_edge = (*horz_edge).prev_in_ael;
                let next_edge = (*horz_edge).next_in_ael;

                if !prev_edge.is_null()
                    && (*prev_edge).curr.almost_equal(&(*horz_edge).bot, None)
                    && (*prev_edge).is_filled()
                    && (*prev_edge).curr.y > (*prev_edge).top.y
                    && TEdge::slopes_equal(horz_edge, prev_edge, self.base.is_use_full_range)
                {
                    let op2 = OutRec::add_out_pt(&mut self.poly_outs, prev_edge, &(*horz_edge).bot);
                    self.joins
                        .push(Join::create(op1, op2, Some(&(*horz_edge).top)));
                } else if !next_edge.is_null()
                    && (*next_edge).curr.almost_equal(&(*horz_edge).bot, None)
                    && (*next_edge).is_filled()
                    && (*next_edge).curr.y > (*next_edge).top.y
                    && TEdge::slopes_equal(horz_edge, next_edge, self.base.is_use_full_range)
                {
                    let op2 = OutRec::add_out_pt(&mut self.poly_outs, next_edge, &(*horz_edge).bot);
                    self.joins
                        .push(Join::create(op1, op2, Some(&(*horz_edge).top)));
                }
            } else {
                self.update_edge_into_ael(horz_edge);
            }
        } else if !e_max_pair.is_null() {
            if (*e_max_pair).is_assigned() {
                if dir == Direction::Right {
                    self.intersect_edges(horz_edge, e_max_pair, &(*horz_edge).top, false);
                } else {
                    self.intersect_edges(e_max_pair, horz_edge, &(*horz_edge).top, false);
                }

                if (*e_max_pair).is_assigned() {
                    //show_error("ProcessHorizontal error");
                }
            } else {
                self.active_edges = (*horz_edge).delete_from_ael(self.active_edges);
                self.active_edges = (*e_max_pair).delete_from_ael(self.active_edges);
            }
        } else {
            if (*horz_edge).is_assigned() {
                OutRec::add_out_pt(&mut self.poly_outs, horz_edge, &(*horz_edge).top);
            }

            self.active_edges = (*horz_edge).delete_from_ael(self.active_edges);
        }
    }

    unsafe fn prepare_horz_joins(&mut self, horz_edge: *mut TEdge, is_top_of_scanbeam: bool) {
        if is_top_of_scanbeam {
            let mut out_pt = (*self.poly_outs[(*horz_edge).index as usize]).pts;

            if (*horz_edge).side == Direction::Right {
                out_pt = (*out_pt).prev;
            }

            let off_point = if (*out_pt).point.almost_equal(&(*horz_edge).top, None) {
                &(*horz_edge).bot
            } else {
                &(*horz_edge).top
            };

            self.ghost_joins
                .push(Join::create(out_pt, std::ptr::null_mut(), Some(off_point)));
        }
    }

    unsafe fn update_edge_into_ael(&mut self, mut edge: *mut TEdge) -> *mut TEdge {
        if (*edge).next_in_lml.is_null() {
            //show_error("UpdateEdgeIntoAEL: invalid call");
            return std::ptr::null_mut();
        }

        let ael_prev = (*edge).prev_in_ael;
        let ael_next = (*edge).next_in_ael;
        (*(*edge).next_in_lml).index = (*edge).index;

        if !ael_prev.is_null() {
            (*ael_prev).next_in_ael = (*edge).next_in_lml;
        } else {
            self.active_edges = (*edge).next_in_lml;
        }

        if !ael_next.is_null() {
            (*ael_next).prev_in_ael = (*edge).next_in_lml;
        }

        (*(*edge).next_in_lml).side = (*edge).side;
        (*(*edge).next_in_lml).wind_delta = (*edge).wind_delta;
        (*(*edge).next_in_lml).wind_cnt = (*edge).wind_cnt;
        (*(*edge).next_in_lml).wind_cnt2 = (*edge).wind_cnt2;

        edge = (*edge).next_in_lml;
        (*edge).curr.update(&(*edge).bot);

        (*edge).prev_in_ael = ael_prev;
        (*edge).next_in_ael = ael_next;

        if !(*edge).is_horizontal() {
            self.scanbeam = Scanbeam::insert((*edge).top.y, self.scanbeam);
        }

        edge
    }

    unsafe fn do_simple_polygons(&mut self) {
        let mut count = self.poly_outs.len();
        let mut i = 0;

        while i < count {
            let out_rec = self.poly_outs[i];
            let out_pt = (*out_rec).pts;

            if !out_pt.is_null() {
                (*out_rec).simplify(out_pt, &mut self.poly_outs);
            }

            count = self.poly_outs.len();
            i += 1;
        }
    }

    pub unsafe fn fixup_intersection_order(&mut self) -> bool {
        self.intersections
            .sort_unstable_by(|a, b| IntersectNode::sort(*a, *b));

        self.copy_ael_to_sel();

        let intersect_count = self.intersections.len();
        let mut i = 0;

        while i < intersect_count {
            if !(*self.intersections[i]).edges_adjacent() {
                let mut j = i + 1;
                while j < intersect_count && !(*self.intersections[j]).edges_adjacent() {
                    j += 1;
                }

                if j == intersect_count {
                    return false;
                }

                self.intersections.swap(i, j);
            }

            self.swap_positions_in_sel(
                (*self.intersections[i]).edge1,
                (*self.intersections[i]).edge2,
            );

            i += 1;
        }

        true
    }

    pub unsafe fn swap_positions_in_ael(&mut self, edge1: *mut TEdge, edge2: *mut TEdge) {
        if !TEdge::swap_positions_in_ael(edge1, edge2) {
            return;
        }

        if (*edge1).prev_in_ael.is_null() {
            self.active_edges = edge1;
        } else if (*edge2).prev_in_ael.is_null() {
            self.active_edges = edge2;
        }
    }

    pub unsafe fn swap_positions_in_sel(&mut self, edge1: *mut TEdge, edge2: *mut TEdge) {
        if !TEdge::swap_positions_in_sel(edge1, edge2) {
            return;
        }

        if (*edge1).prev_in_sel.is_null() {
            self.sorted_edges = edge1;
        } else if (*edge2).prev_in_sel.is_null() {
            self.sorted_edges = edge2;
        }
    }

    pub unsafe fn copy_ael_to_sel(&mut self) {
        let mut edge = self.active_edges;
        self.sorted_edges = edge;

        while !edge.is_null() {
            edge = (*edge).copy_ael_to_sel();
        }
    }

    unsafe fn build_intersect_list(&mut self, bot_y: i32, top_y: i32) {
        if self.active_edges.is_null() {
            return;
        }

        let mut edge = self.active_edges;
        self.sorted_edges = edge;

        while !edge.is_null() {
            (*edge).prev_in_sel = (*edge).prev_in_ael;
            (*edge).next_in_sel = (*edge).next_in_ael;
            (*edge).curr.x = (*edge).top_x(top_y) as i32;
            edge = (*edge).next_in_ael;
        }

        let mut is_modified = true;
        let mut point = Point::<i32>::new(None, None);

        while is_modified && !self.sorted_edges.is_null() {
            is_modified = false;
            let mut edge = self.sorted_edges;

            while !(*edge).next_in_sel.is_null() {
                let next_edge = (*edge).next_in_sel;
                point.set(0, 0);

                if (*edge).curr.x > (*next_edge).curr.x {
                    if !TEdge::intersect_point(
                        edge,
                        next_edge,
                        &mut point,
                        self.base.is_use_full_range,
                    ) && (*edge).curr.x > (*next_edge).curr.x + 1
                    {
                        //show_error("Intersection error");
                    }

                    if point.y > bot_y {
                        let new_x = if (*edge).dx.abs() > (*next_edge).dx.abs() {
                            (*next_edge).top_x(bot_y)
                        } else {
                            (*edge).top_x(bot_y)
                        };
                        point.set(new_x as i32, bot_y);
                    }

                    self.intersections
                        .push(IntersectNode::create(edge, next_edge, Some(&point)));

                    self.swap_positions_in_sel(edge, next_edge);
                    is_modified = true;
                } else {
                    edge = next_edge;
                }
            }

            if !(*edge).prev_in_sel.is_null() {
                (*(*edge).prev_in_sel).next_in_sel = std::ptr::null_mut();
            } else {
                break;
            }
        }

        self.sorted_edges = std::ptr::null_mut();
    }
}
