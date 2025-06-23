use crate::clipper::clipper_base::ClipperBase;
use crate::clipper::enums::{ClipType, Direction, PolyFillType};
use crate::clipper::intersect_node::IntersectNode;
use crate::clipper::join::Join;
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

        // Копіювання властивостей
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
        // Сортуємо перетини — нижній перший (використовуємо sort_unstable_by для продуктивності)
        self.intersections
            .sort_unstable_by(|a, b| IntersectNode::sort(*a, *b));

        // Копіюємо AEL → SEL
        self.copy_ael_to_sel();

        let intersect_count = self.intersections.len();
        let mut i = 0;

        while i < intersect_count {
            if !(*self.intersections[i]).edges_adjacent() {
                // Пошук наступного перетину з суміжними ребрами
                let mut j = i + 1;
                while j < intersect_count && !(*self.intersections[j]).edges_adjacent() {
                    j += 1;
                }

                if j == intersect_count {
                    return false;
                }

                // Міняємо місцями
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

        // Підготовка до сортування
        while !edge.is_null() {
            (*edge).prev_in_sel = (*edge).prev_in_ael;
            (*edge).next_in_sel = (*edge).next_in_ael;
            (*edge).curr.x = (*edge).top_x(top_y) as i32;
            edge = (*edge).next_in_ael;
        }

        // Сортування: bubble sort
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
