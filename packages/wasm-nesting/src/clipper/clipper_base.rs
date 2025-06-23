use crate::clipper::enums::PolyType;
use crate::clipper::local_minima::LocalMinima;
use crate::clipper::t_edge::TEdge;
use crate::geometry::point::Point;
use std::ptr;

pub struct ClipperBase {
    pub minima_list: *mut LocalMinima,
    pub is_use_full_range: bool,
    pub current_lm: *mut LocalMinima,
}

impl ClipperBase {
    pub fn new() -> Self {
        Self {
            minima_list: std::ptr::null_mut(),
            is_use_full_range: false,
            current_lm: std::ptr::null_mut(),
        }
    }

    pub unsafe fn add_path(&mut self, polygon: &Vec<Point<i32>>, poly_type: PolyType) -> bool {
        let mut last_index: usize = polygon.len() - 1;

        while last_index > 0
            && (polygon[last_index].almost_equal(&polygon[0], None)
                || polygon[last_index].almost_equal(&polygon[last_index - 1], None))
        {
            last_index -= 1;
        }

        if last_index < 2 {
            return false;
        }

        //create a new edge array ...
        let mut edges: Vec<*mut TEdge> = Vec::new();

        for _i in 0..last_index {
            edges.push(TEdge::create());
        }

        //1. Basic (first) edge initialization ...

        //edges[1].curr = pg[1];
        (*edges[1]).curr.update(&polygon[1]);

        self.is_use_full_range = polygon[0].range_test(self.is_use_full_range);
        self.is_use_full_range = polygon[last_index].range_test(self.is_use_full_range);

        (*edges[0]).init(edges[1], edges[last_index], &polygon[0]);
        (*edges[last_index]).init(edges[0], edges[last_index - 1], &polygon[last_index]);

        for i in (1..last_index).rev() {
            self.is_use_full_range = polygon[i].range_test(self.is_use_full_range);

            (*edges[i]).init(edges[i + 1], edges[i - 1], &polygon[i]);
        }

        let mut start_edge = edges[0];
        //2. Remove duplicate vertices, and (when closed) collinear edges ...
        let mut edge = start_edge;
        let mut loop_stop_edge = start_edge;

        loop {
            if (*edge).curr.almost_equal(&(*(*edge).next).curr, None) {
                if ptr::eq(edge, (*edge).next) {
                    break;
                }

                if ptr::eq(edge, start_edge) {
                    start_edge = (*edge).next;
                }

                edge = (*edge).remove();
                loop_stop_edge = edge;

                continue;
            }

            if (*edge).is_cycled() {
                break;
            }

            if Point::<i32>::slopes_equal(
                &(*(*edge).prev).curr,
                &(*edge).curr,
                &(*(*edge).next).curr,
                self.is_use_full_range,
            ) {
                //Collinear edges are allowed for open paths but in closed paths
                //the default is to merge adjacent collinear edges into a single edge.
                //However, if the PreserveCollinear property is enabled, only overlapping
                //collinear edges (ie spikes) will be removed from closed paths.
                if ptr::eq(edge, start_edge) {
                    start_edge = (*edge).next;
                }

                edge = (*edge).remove();
                edge = (*edge).prev;
                loop_stop_edge = edge;

                continue;
            }

            edge = (*edge).next;

            if ptr::eq(edge, loop_stop_edge) {
                break;
            }
        }

        if (*edge).is_cycled() {
            return false;
        }

        //3. Do second stage of edge initialization ...
        edge = start_edge;

        let mut is_flat = true;

        loop {
            (*edge).init_from_poly_type(poly_type);
            edge = (*edge).next;

            if is_flat && (*edge).curr.y != (*start_edge).curr.y {
                is_flat = false;
            }

            if ptr::eq(edge, start_edge) {
                break;
            }
        }
        //4. Finally, add edge bounds to LocalMinima list ...
        //Totally flat paths must be handled differently when adding them
        //to LocalMinima list to avoid endless loops etc ...
        if is_flat {
            return false;
        }

        let mut min_edge = ptr::null_mut();

        loop {
            edge = (*edge).find_next_loc_min();

            if ptr::eq(edge, min_edge) {
                break;
            }

            if min_edge.is_null() {
                min_edge = edge;
            }
            //E and E.prev now share a local minima (left aligned if horizontal).
            //Compare their slopes to find which starts which bound ...
            let is_clockwise = (*edge).dx >= (*(*edge).prev).dx;

            let loc_min = LocalMinima::from_edge(edge, is_clockwise);

            edge = self.process_bound((*loc_min).left_bound, is_clockwise);

            let edge2 = self.process_bound((*loc_min).right_bound, !is_clockwise);

            self.minima_list = (*loc_min).insert(self.minima_list);

            if !is_clockwise {
                edge = edge2;
            }
        }

        return true;
    }

    pub unsafe fn add_paths(
        &mut self,
        polygons: &Vec<Vec<Point<i32>>>,
        poly_type: PolyType,
    ) -> bool {
        let polygon_count = polygons.len();
        let mut result = false;

        for i in 0..polygon_count {
            if self.add_path(&polygons[i], poly_type) {
                result = true;
            }
        }

        result
    }

    fn process_bound(&mut self, mut edge: *mut TEdge, is_clockwise: bool) -> *mut TEdge {
        unsafe {
            let start_edge = edge;
            let mut result = edge;
            let mut horz_edge: *mut TEdge;

            if (*edge).is_dx_horizontal() {
                let start_x = if is_clockwise {
                    (*(*edge).prev).bot.x
                } else {
                    (*(*edge).next).bot.x
                };

                if (*edge).bot.x != start_x {
                    (*edge).reverse_horizontal();
                }
            }

            if is_clockwise {
                while (*result).top.y == (*(*result).next).bot.y {
                    result = (*result).next;
                }

                if (*result).is_dx_horizontal() {
                    horz_edge = result;
                    while (*(*horz_edge).prev).is_dx_horizontal() {
                        horz_edge = (*horz_edge).prev;
                    }

                    if (*(*horz_edge).prev).top.x == (*(*result).next).top.x {
                        if !is_clockwise {
                            result = (*horz_edge).prev;
                        }
                    } else if (*(*horz_edge).prev).top.x > (*(*result).next).top.x {
                        result = (*horz_edge).prev;
                    }
                }

                while !std::ptr::eq(edge, result) {
                    (*edge).next_in_lml = (*edge).next;
                    if (*edge).is_dx_horizontal()
                        && !std::ptr::eq(edge, start_edge)
                        && (*edge).bot.x != (*(*edge).prev).top.x
                    {
                        (*edge).reverse_horizontal();
                    }
                    edge = (*edge).next;
                }

                if (*edge).is_dx_horizontal()
                    && !std::ptr::eq(edge, start_edge)
                    && (*edge).bot.x != (*(*edge).prev).top.x
                {
                    (*edge).reverse_horizontal();
                }

                result = (*result).next;
            } else {
                while (*result).top.y == (*(*result).prev).bot.y {
                    result = (*result).prev;
                }

                if (*result).is_dx_horizontal() {
                    horz_edge = result;
                    while (*(*horz_edge).next).is_dx_horizontal() {
                        horz_edge = (*horz_edge).next;
                    }

                    if (*(*horz_edge).next).top.x == (*(*result).prev).top.x {
                        if !is_clockwise {
                            result = (*horz_edge).next;
                        }
                    } else if (*(*horz_edge).next).top.x > (*(*result).prev).top.x {
                        result = (*horz_edge).next;
                    }
                }

                while !std::ptr::eq(edge, result) {
                    (*edge).next_in_lml = (*edge).prev;
                    if (*edge).is_dx_horizontal()
                        && !std::ptr::eq(edge, start_edge)
                        && (*edge).bot.x != (*(*edge).next).top.x
                    {
                        (*edge).reverse_horizontal();
                    }
                    edge = (*edge).prev;
                }

                if (*edge).is_dx_horizontal()
                    && !std::ptr::eq(edge, start_edge)
                    && (*edge).bot.x != (*(*edge).next).top.x
                {
                    (*edge).reverse_horizontal();
                }

                result = (*result).prev;
            }

            result
        }
    }

    pub fn reset(&mut self) {
        self.current_lm = self.minima_list;

        if !self.minima_list.is_null() {
            unsafe { (*self.minima_list).reset() };
        }
    }
}
