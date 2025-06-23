use crate::clipper::enums::{Direction, PolyType};
use crate::clipper::clipper_pool_manager::get_pool;
use crate::clipper::local_minima::LocalMinima;
use crate::clipper::t_edge::TEdge;
use crate::geometry::point::Point;

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

    pub fn add_path(&mut self, polygon: &[Point<i32>], poly_type: PolyType) -> bool {
        let mut last_index = polygon.len().wrapping_sub(1);
        while last_index > 0
            && (polygon[last_index] == polygon[0] || polygon[last_index] == polygon[last_index - 1])
        {
            last_index -= 1;
        }

        if last_index < 2 {
            return false;
        }

        let mut edges: Vec<*mut TEdge> = (0..=last_index).map(|_| get_pool().t_edge_pool.get()).collect();

        edges[1].curr.update(&polygon[1]);

        self.is_use_full_range = polygon[0].range_test(self.is_use_full_range);
        self.is_use_full_range = polygon[last_index].range_test(self.is_use_full_range);

        edges[0].init(&mut edges[1], &mut edges[last_index], &polygon[0]);
        edges[last_index].init(
            &mut edges[0],
            &mut edges[last_index - 1],
            &polygon[last_index],
        );

        for i in (1..last_index).rev() {
            self.is_use_full_range = polygon[i].range_test(self.is_use_full_range);
            edges[i].init(&mut edges[i + 1], &mut edges[i - 1], &polygon[i]);
        }

        let mut start_edge = &mut edges[0] as *mut TEdge;
        let mut edge = start_edge;
        let mut loop_stop_edge = start_edge;

        unsafe {
            loop {
                if (*edge).curr == (*(*edge).next).curr {
                    if std::ptr::eq(edge, (*edge).next) {
                        break;
                    }
                    if std::ptr::eq(edge, start_edge) {
                        start_edge = (*edge).next;
                    }
                    edge = (*edge).remove();
                    loop_stop_edge = edge;
                    continue;
                }

                if std::ptr::eq((*edge).prev, (*edge).next) {
                    break;
                }

                if Point::slopes_equal(
                    &(*(*edge).prev).curr,
                    &(*edge).curr,
                    &(*(*edge).next).curr,
                    self.is_use_full_range,
                ) {
                    if std::ptr::eq(edge, start_edge) {
                        start_edge = (*edge).next;
                    }
                    edge = (*edge).remove();
                    edge = (*edge).prev;
                    loop_stop_edge = edge;
                    continue;
                }

                edge = (*edge).next;
                if std::ptr::eq(edge, loop_stop_edge) {
                    break;
                }
            }

            if std::ptr::eq((*edge).prev, (*edge).next) {
                return false;
            }

            edge = start_edge;
            let mut is_flat = true;
            loop {
                (*edge).init_from_poly_type(poly_type);
                edge = (*edge).next;
                if is_flat && (*edge).curr.y != (*start_edge).curr.y {
                    is_flat = false;
                }
                if std::ptr::eq(edge, start_edge) {
                    break;
                }
            }

            if is_flat {
                return false;
            }

            let mut is_clockwise = false;
            let mut min_edge: *mut TEdge = std::ptr::null_mut();

            loop {
                edge = (*edge).find_next_loc_min();

                if edge == min_edge {
                    break;
                }

                if min_edge.is_null() {
                    min_edge = edge;
                }

                is_clockwise = (*edge).dx >= (*(*edge).prev).dx;

                let loc_min = if is_clockwise {
                    Box::<LocalMinima>::into_raw(LocalMinima::new(
                        (*edge).bot.y,
                        edge,
                        (*edge).prev,
                    ))
                } else {
                    Box::<LocalMinima>::into_raw(LocalMinima::new(
                        (*edge).bot.y,
                        (*edge).prev,
                        edge,
                    ))
                };

                (*loc_min).left_bound.as_mut().unwrap().side = Direction::Left;
                (*loc_min).right_bound.as_mut().unwrap().side = Direction::Right;
                (*loc_min).left_bound.as_mut().unwrap().wind_delta = if std::ptr::eq(
                    (*loc_min).left_bound.unwrap().next,
                    (*loc_min).right_bound.unwrap(),
                ) {
                    -1
                } else {
                    1
                };
                (*loc_min).right_bound.as_mut().unwrap().wind_delta =
                    -(*loc_min).left_bound.unwrap().wind_delta;

                edge = self.process_bound((*loc_min).left_bound.unwrap(), is_clockwise);
                let edge2 = self.process_bound((*loc_min).right_bound.unwrap(), !is_clockwise);

                (*loc_min).next = self.minima_list;
                self.minima_list = loc_min;

                if !is_clockwise {
                    edge = edge2;
                }
            }
        }

        true
    }

    pub fn add_paths(&mut self, polygons: &[Vec<Point<i32>>], poly_type: PolyType) -> bool {
        let mut result = false;
        for poly in polygons.iter() {
            if self.add_path(poly, poly_type) {
                result = true;
            }
        }
        result
    }

    fn process_bound(&mut self, mut edge: *mut TEdge, is_clockwise: bool) -> *mut TEdge {
        unsafe {
            let start_edge = edge;
            let mut result = edge;
            let mut horz_edge: *mut TEdge = std::ptr::null_mut();

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
