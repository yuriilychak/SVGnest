use crate::clipper::clipper_instance::ClipperInstance;
use crate::clipper::clipper_pool_manager::get_pool;
use crate::clipper::enums::{ClipType, Direction, PolyFillType, PolyType};
use crate::geometry::point::Point;
use crate::utils::math::slopes_equal;
use crate::utils::round::ClipperRound;
use std::ptr;

pub const HORIZONTAL: f64 = -9007199254740992.00;

pub struct TEdge {
    pub bot: Point<i32>,
    pub curr: Point<i32>,
    pub top: Point<i32>,
    pub delta: Point<i32>,
    pub dx: f64,
    pub poly_typ: PolyType,
    pub side: Direction,
    pub wind_delta: i32,
    pub wind_cnt: i32,
    pub wind_cnt2: i32,
    pub index: i32,
    pub next: *mut TEdge,
    pub prev: *mut TEdge,
    pub next_in_lml: *mut TEdge,
    pub next_in_ael: *mut TEdge,
    pub prev_in_ael: *mut TEdge,
    pub next_in_sel: *mut TEdge,
    pub prev_in_sel: *mut TEdge,
}

impl ClipperInstance for TEdge {
    fn new() -> Self {
        Self {
            bot: Point::<i32>::new(None, None),
            curr: Point::<i32>::new(None, None),
            top: Point::<i32>::new(None, None),
            delta: Point::<i32>::new(None, None),
            dx: 0.0,
            poly_typ: PolyType::Subject,
            side: Direction::Left,
            wind_delta: 0,
            wind_cnt: 0,
            wind_cnt2: 0,
            index: 0,
            next: ptr::null_mut(),
            prev: ptr::null_mut(),
            next_in_lml: ptr::null_mut(),
            next_in_ael: ptr::null_mut(),
            prev_in_ael: ptr::null_mut(),
            next_in_sel: ptr::null_mut(),
            prev_in_sel: ptr::null_mut(),
        }
    }

    fn clean(&mut self) {
        unsafe {
            self.bot.set(0, 0);
            self.curr.set(0, 0);
            self.top.set(0, 0);
            self.delta.set(0, 0);
        }
        self.dx = 0.0;
        self.poly_typ = PolyType::Subject;
        self.side = Direction::Left;
        self.wind_delta = 0;
        self.wind_cnt = 0;
        self.wind_cnt2 = 0;
        self.index = 0;
        self.next = ptr::null_mut();
        self.prev = ptr::null_mut();
        self.next_in_lml = ptr::null_mut();
        self.next_in_ael = ptr::null_mut();
        self.prev_in_ael = ptr::null_mut();
        self.next_in_sel = ptr::null_mut();
        self.prev_in_sel = ptr::null_mut();
    }
}

impl TEdge {
    pub fn create() -> *mut Self {
        let result = get_pool().t_edge_pool.get();

        result
    }

    pub unsafe fn init(&mut self, next: *mut TEdge, prev: *mut TEdge, point: *const Point<i32>) {
        self.next = next;
        self.prev = prev;
        //e.curr = pt;
        self.curr.update(point);
        self.unassign();
    }

    pub unsafe fn init_from_poly_type(&mut self, poly_type: PolyType) {
        if self.curr.y >= (*self.next).curr.y {
            self.bot.update(&self.curr);
            self.top.update(&(*self.next).curr);
        } else {
            self.top.update(&self.curr);
            self.bot.update(&(*self.next).curr);
        }

        self.set_dx();

        self.poly_typ = poly_type;
    }

    pub unsafe fn remove(&mut self) -> *mut TEdge {
        let result = self.next;
        //removes e from double_linked_list (but without removing from memory)
        (*self.prev).next = self.next;
        (*self.next).prev = self.prev;
        self.prev = ptr::null_mut(); //flag as removed (see ClipperBase.Clear)
        self.next = ptr::null_mut();

        return result;
    }

    pub unsafe fn reverse_horizontal(&mut self) {
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        let tmp = self.top.x;
        self.top.x = self.bot.x;
        self.bot.x = tmp;
    }

    pub unsafe fn find_next_loc_min(&mut self) -> *mut TEdge {
        let mut result = self as *mut TEdge;

        loop {
            while !(*result).bot.almost_equal(&(*(*result).prev).bot, None)
                || (*result).curr.almost_equal(&(*result).top, None)
            {
                result = (*result).next;
            }

            if !(*result).is_dx_horizontal() && !(*(*result).prev).is_dx_horizontal() {
                break;
            }

            while (*(*result).prev).is_dx_horizontal() {
                result = (*result).prev;
            }

            let edge = result;

            while (*result).is_dx_horizontal() {
                result = (*result).next;
            }

            if (*result).top.y == (*(*result).prev).bot.y {
                continue;
            }

            //ie just an intermediate horz.
            if (*(*edge).prev).bot.x < (*result).bot.x {
                result = edge;
            }

            break;
        }

        return result;
    }

    pub unsafe fn set_dx(&mut self) {
        self.delta.update(&self.top);
        self.delta.sub(&self.bot);
        self.dx = if self.delta.y == 0 {
            HORIZONTAL
        } else {
            (self.delta.x as f64) / (self.delta.y as f64)
        };
    }

    pub unsafe fn reset(&mut self, side: Direction) {
        self.curr.update(&self.bot);
        self.side = side;
        self.unassign();
    }

    pub unsafe fn copy_ael_to_sel(&mut self) -> *mut TEdge {
        self.prev_in_sel = self.prev_in_ael;
        self.next_in_sel = self.next_in_ael;

        return self.next_in_ael;
    }

    pub unsafe fn top_x(&self, y: i32) -> f64 {
        //if (edge.bot == edge.Curr) alert ("edge.bot = edge.Curr");
        //if (edge.bot == edge.top) alert ("edge.bot = edge.top");
        if y == self.top.y {
            self.top.x as f64
        } else {
            (self.bot.x as f64) + (self.dx * ((y - self.bot.y) as f64)).clipper_rounded()
        }
    }

    pub fn get_next(&self, is_ael: bool) -> *mut TEdge {
        if is_ael {
            self.next_in_ael
        } else {
            self.next_in_sel
        }
    }

    pub fn set_next(&mut self, is_ael: bool, input_edge: *mut TEdge) {
        if is_ael {
            self.next_in_ael = input_edge;
        } else {
            self.next_in_sel = input_edge;
        }
    }

    pub fn get_prev(&self, is_ael: bool) -> *mut TEdge {
        if is_ael {
            self.prev_in_ael
        } else {
            self.prev_in_sel
        }
    }

    pub fn set_prev(&mut self, is_ael: bool, input_edge: *mut TEdge) {
        if is_ael {
            self.prev_in_ael = input_edge;
        } else {
            self.prev_in_sel = input_edge;
        }
    }

    unsafe fn delete_from_el(&mut self, is_ael: bool, input_edge: *mut TEdge) -> *mut TEdge {
        let self_pointer = self as *mut TEdge;
        let next = self.get_next(is_ael);
        let prev = self.get_prev(is_ael);
        let has_next = !next.is_null();
        let has_prev = !prev.is_null();

        if !has_prev && !has_next && !ptr::eq(self_pointer, input_edge) {
            return input_edge;
        }

        let mut result = input_edge;
        //already deleted
        if has_prev {
            (*prev).set_next(is_ael, next);
        } else {
            result = next;
        }

        if has_next {
            (*next).set_prev(is_ael, prev);
        }

        self.set_next(is_ael, ptr::null_mut());
        self.set_prev(is_ael, ptr::null_mut());

        return result;
    }

    pub unsafe fn delete_from_sel(&mut self, input_edge: *mut TEdge) -> *mut TEdge {
        self.delete_from_el(false, input_edge)
    }

    pub unsafe fn delete_from_ael(&mut self, input_edge: *mut TEdge) -> *mut TEdge {
        self.delete_from_el(true, input_edge)
    }

    pub unsafe fn get_intermediate(&self, y: i32) -> bool {
        self.top.y == y && !self.next_in_lml.is_null()
    }

    pub unsafe fn is_filled(&self) -> bool {
        self.is_assigned() && !self.is_wind_delta_empty()
    }

    pub unsafe fn is_cycled(&self) -> bool {
        ptr::eq(self.prev, self.next)
    }

    pub unsafe fn is_horizontal(&self) -> bool {
        self.delta.y == 0
    }

    pub unsafe fn is_wind_delta_empty(&self) -> bool {
        return self.wind_delta == 0;
    }

    pub fn is_dx_horizontal(&self) -> bool {
        return self.dx == HORIZONTAL;
    }

    pub unsafe fn maxima_pair(&self) -> *mut TEdge {
        let mut result: *mut TEdge = ptr::null_mut();

        if !self.next.is_null()
            && (*self.next).top.almost_equal(&self.top, None)
            && (*self.next).next_in_lml.is_null()
        {
            result = self.next;
        } else if !self.prev.is_null()
            && (*self.prev).top.almost_equal(&self.top, None)
            && (*self.prev).next_in_lml.is_null()
        {
            result = self.prev;
        }

        if !result.is_null()
            && ptr::eq((*result).next_in_ael, (*result).prev_in_ael)
            && !(*result).is_horizontal()
        {
            ptr::null_mut()
        } else {
            result
        }
    }

    pub fn get_maxima(&self, y: i32) -> bool {
        self.top.y == y && self.next_in_lml.is_null()
    }

    pub fn get_contributing(&self, clip_type: ClipType, fill_type: PolyFillType) -> bool {
        let is_reverse = clip_type == ClipType::Difference && self.poly_typ == PolyType::Clip;

        match fill_type {
            PolyFillType::NonZero => {
                self.wind_cnt.abs() == 1 && is_reverse != (self.wind_cnt2 == 0)
            }
            PolyFillType::Positive => self.wind_cnt == 1 && is_reverse != (self.wind_cnt2 <= 0),
            _ => self.wind_cnt == -1 && is_reverse != (self.wind_cnt2 >= 0),
        }
    }

    pub unsafe fn inserts_before(&self, edge: *mut TEdge) -> bool {
        if self.curr.x == (*edge).curr.x {
            if self.top.y > (*edge).top.y {
                (self.top.x as f64) < (*edge).top_x(self.top.y)
            } else {
                ((*edge).top.x as f64) > self.top_x((*edge).top.y)
            }
        } else {
            self.curr.x < (*edge).curr.x
        }
    }

    pub unsafe fn add_edge_to_sel(&mut self, sorted_edge: *mut TEdge) -> *mut TEdge {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        self.prev_in_sel = ptr::null_mut();
        self.next_in_sel = sorted_edge;

        if !sorted_edge.is_null() {
            (*sorted_edge).prev_in_sel = self as *mut TEdge;
        }

        return self as *mut TEdge;
    }

    pub unsafe fn insert_edge_into_ael(
        &mut self,
        active_edge: *mut TEdge,
        start_edge: Option<*mut TEdge>,
    ) -> *mut TEdge {
        let inner_edge = start_edge.unwrap_or(ptr::null_mut());

        if active_edge.is_null() {
            self.prev_in_ael = ptr::null_mut();
            self.next_in_ael = ptr::null_mut();

            return self as *mut TEdge;
        }

        if inner_edge.is_null() && self.inserts_before(active_edge) {
            self.prev_in_ael = ptr::null_mut();
            self.next_in_ael = active_edge;

            (*active_edge).prev_in_ael = self as *mut TEdge;

            return self as *mut TEdge;
        }

        let mut edge = if inner_edge.is_null() {
            active_edge
        } else {
            inner_edge
        };

        while !(*edge).next_in_ael.is_null() && !self.inserts_before((*edge).next_in_ael) {
            edge = (*edge).next_in_ael;
        }

        self.next_in_ael = (*edge).next_in_ael;

        if !(*edge).next_in_ael.is_null() {
            (*(*edge).next_in_ael).prev_in_ael = self as *mut TEdge;
        }

        self.prev_in_ael = edge;
        (*edge).next_in_ael = self as *mut TEdge;

        return active_edge;
    }

    pub fn get_next_in_ael(&self, direction: Direction) -> *mut TEdge {
        if direction == Direction::Right {
            self.next_in_ael
        } else {
            self.prev_in_ael
        }
    }

    pub fn unassign(&mut self) {
        self.index = -1;
    }

    pub fn horz_direction(&self) -> (Direction, i32, i32) {
        if self.bot.x < self.top.x {
            (Direction::Right, self.bot.x, self.top.x)
        } else {
            (Direction::Left, self.top.x, self.bot.x)
        }
    }

    pub fn is_assigned(&self) -> bool {
        self.index != -1
    }

    pub unsafe fn set_winding_count(&mut self, active_edge: *mut TEdge, clip_type: ClipType) {
        let mut edge = self.prev_in_ael;
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while !edge.is_null()
            && ((*edge).poly_typ != self.poly_typ || (*edge).is_wind_delta_empty())
        {
            edge = (*edge).prev_in_ael;
        }

        if edge.is_null() {
            self.wind_cnt = if self.is_wind_delta_empty() {
                1
            } else {
                self.wind_delta
            };
            self.wind_cnt2 = 0;
            edge = active_edge;
            //ie get ready to calc wind_cnt2
        } else if self.is_wind_delta_empty() && clip_type != ClipType::Union {
            self.wind_cnt = 1;
            self.wind_cnt2 = (*edge).wind_cnt2;
            edge = (*edge).next_in_ael;
            //ie get ready to calc wind_cnt2
        } else {
            //nonZero, Positive or Negative filling ...
            if (*edge).wind_cnt * (*edge).wind_delta < 0 {
                //prev edge is 'decreasing' WindCount (WC) toward zero
                //so we're outside the previous polygon ...
                if (*edge).wind_cnt.abs() > 1 {
                    //outside prev poly but still inside another.
                    //when reversing direction of prev poly use the same WC
                    self.wind_cnt = if (*edge).wind_delta * self.wind_delta < 0 {
                        (*edge).wind_cnt
                    } else {
                        (*edge).wind_cnt + self.wind_delta
                    };
                } else {
                    self.wind_cnt = if self.is_wind_delta_empty() {
                        1
                    } else {
                        self.wind_delta
                    };
                }
            } else {
                //prev edge is 'increasing' WindCount (WC) away from zero
                //so we're inside the previous polygon ...
                if self.is_wind_delta_empty() {
                    self.wind_cnt = if (*edge).wind_cnt < 0 {
                        (*edge).wind_cnt - 1
                    } else {
                        (*edge).wind_cnt + 1
                    };
                } else {
                    self.wind_cnt = if (*edge).wind_delta * self.wind_delta < 0 {
                        (*edge).wind_cnt
                    } else {
                        (*edge).wind_cnt + self.wind_delta
                    };
                }
            }

            self.wind_cnt2 = (*edge).wind_cnt2;
            edge = (*edge).next_in_ael;
            //ie get ready to calc wind_cnt2
        }

        let self_pointer = self as *mut TEdge;
        //nonZero, Positive or Negative filling ...
        while edge != self_pointer {
            self.wind_cnt2 += (*edge).wind_delta;
            edge = (*edge).next_in_ael;
        }
    }

    pub fn get_intersect_b(&self) -> f64 {
        return (self.bot.x as f64) - (self.bot.y as f64) * self.dx;
    }

    pub unsafe fn intersect_point(
        edge1: *mut TEdge,
        edge2: *mut TEdge,
        intersect_point: *mut Point<i32>,
        use_full_range: bool,
    ) -> bool {
        //nb: with very large coordinate values, it's possible for SlopesEqual() to
        //return false but for the edge.dx value be equal due to double precision rounding.
        if TEdge::slopes_equal(edge1, edge2, use_full_range) || (*edge1).dx == (*edge2).dx {
            let point = if (*edge2).bot.y > (*edge1).bot.y {
                &(*edge2).bot
            } else {
                &(*edge1).bot
            };

            (*intersect_point).update(point);

            return false;
        }

        let x: i32;
        let y: i32;

        let bot_x_1 = (*edge1).bot.x;
        let bot_x_2 = (*edge2).bot.x;
        let bot_y_1 = (*edge1).bot.y;
        let bot_y_2 = (*edge2).bot.y;
        let dx1 = (*edge1).dx;
        let dx2 = (*edge2).dx;

        if (*edge1).delta.x == 0 {
            x = bot_x_1;
            y = if (*edge2).is_horizontal() {
                bot_y_2
            } else {
                ((((bot_x_1 - bot_x_2).clipper_rounded() as f64) / dx2) as i32) + bot_y_2
            };
        } else if (*edge2).delta.x == 0 {
            x = bot_x_2;
            y = if (*edge1).is_horizontal() {
                bot_y_1
            } else {
                ((((bot_x_2 - bot_x_1).clipper_rounded() as f64) / dx1) as i32) + bot_y_1
            };
        } else {
            let b1 = (*edge1).get_intersect_b();
            let b2 = (*edge2).get_intersect_b();
            let q = (b2 - b1) / (dx1 - dx2);
            let raw_x = if dx1.abs() < dx2.abs() {
                dx1 * q + b1
            } else {
                dx2 * q + b2
            };

            x = raw_x.clipper_rounded() as i32;
            y = q.clipper_rounded() as i32;
        }

        (*intersect_point).set(x, y);

        let top_y_1 = (*edge1).top.y;
        let top_y_2 = (*edge2).top.y;

        if (*intersect_point).y < top_y_1 || (*intersect_point).y < top_y_2 {
            if top_y_1 > top_y_2 {
                let x = (*edge2).top_x(top_y_1) as i32;
                let y = top_y_1;
                (*intersect_point).set(x, y);

                return (*intersect_point).x < (*edge1).top.x;
            }

            let x = if dx1.abs() < dx2.abs() {
                (*edge1).top_x((*intersect_point).y) as i32
            } else {
                (*edge2).top_x((*intersect_point).y) as i32
            };
            let y = top_y_2;

            (*intersect_point).set(x, y);
        }

        return true;
    }

    pub unsafe fn slopes_equal(edge1: *mut TEdge, edge2: *mut TEdge, use_full_range: bool) -> bool {
        slopes_equal(
            (*edge1).delta.y as f64,
            (*edge2).delta.x as f64,
            (*edge1).delta.x as f64,
            (*edge2).delta.y as f64,
            use_full_range,
        )
    }

    pub unsafe fn swap_position_in_el(edge1: *mut TEdge, edge2: *mut TEdge, is_ael: bool) -> bool {
        //check that one or other edge hasn't already been removed from EL ...
        let is_removed = if is_ael {
            ptr::eq((*edge1).get_next(is_ael), (*edge1).get_prev(is_ael))
                || ptr::eq((*edge2).get_next(is_ael), (*edge2).get_prev(is_ael))
        } else {
            ((*edge1).get_next(is_ael).is_null() && (*edge1).get_prev(is_ael).is_null())
                || ((*edge2).get_next(is_ael).is_null() && (*edge2).get_prev(is_ael).is_null())
        };

        if is_removed {
            return false;
        }

        if ptr::eq((*edge1).get_next(is_ael), edge2) {
            let next = (*edge2).get_next(is_ael);

            if !next.is_null() {
                (*next).set_prev(is_ael, edge1);
            }

            let prev = (*edge1).get_prev(is_ael);

            if !prev.is_null() {
                (*prev).set_next(is_ael, edge2);
            }

            (*edge2).set_prev(is_ael, prev);
            (*edge2).set_next(is_ael, edge1);
            (*edge1).set_prev(is_ael, edge2);
            (*edge1).set_next(is_ael, next);

            return true;
        }

        if ptr::eq((*edge2).get_next(is_ael), edge1) {
            let next = (*edge1).get_next(is_ael);

            if !next.is_null() {
                (*next).set_prev(is_ael, edge2);
            }

            let prev = (*edge2).get_prev(is_ael);

            if !prev.is_null() {
                (*prev).set_next(is_ael, edge1);
            }

            (*edge1).set_prev(is_ael, prev);
            (*edge1).set_next(is_ael, edge2);
            (*edge2).set_prev(is_ael, edge1);
            (*edge2).set_next(is_ael, next);

            return true;
        }

        let next = (*edge1).get_next(is_ael);
        let prev = (*edge1).get_prev(is_ael);

        (*edge1).set_next(is_ael, (*edge2).get_next(is_ael));

        if !(*edge1).get_next(is_ael).is_null() {
            (*(*edge1).get_next(is_ael)).set_prev(is_ael, edge1);
        }

        (*edge1).set_prev(is_ael, (*edge2).get_prev(is_ael));

        if !(*edge1).get_prev(is_ael).is_null() {
            (*(*edge1).get_prev(is_ael)).set_next(is_ael, edge1);
        }

        (*edge2).set_next(is_ael, next);

        if !(*edge2).get_next(is_ael).is_null() {
            (*(*edge2).get_next(is_ael)).set_prev(is_ael, edge2);
        }

        (*edge2).set_prev(is_ael, prev);

        if !(*edge2).get_prev(is_ael).is_null() {
            (*(*edge2).get_prev(is_ael)).set_next(is_ael, edge2);
        }

        return true;
    }

    pub unsafe fn swap_positions_in_ael(edge1: *mut TEdge, edge2: *mut TEdge) -> bool {
        TEdge::swap_position_in_el(edge1, edge2, true)
    }

    pub unsafe fn swap_positions_in_sel(edge1: *mut TEdge, edge2: *mut TEdge) -> bool {
        TEdge::swap_position_in_el(edge1, edge2, false)
    }

    pub unsafe fn swap_sides(edge1: *mut TEdge, edge2: *mut TEdge) {
        let side = (*edge1).side;
        (*edge1).side = (*edge2).side;
        (*edge2).side = side;
    }

    pub unsafe fn swap_poly_indexes(edge1: *mut TEdge, edge2: *mut TEdge) {
        let out_index = (*edge1).index;
        (*edge1).index = (*edge2).index;
        (*edge2).index = out_index;
    }
}
