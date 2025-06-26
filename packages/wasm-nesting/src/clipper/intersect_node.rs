use crate::clipper::clipper_instance::ClipperInstance;
use crate::clipper::clipper_pool_manager::get_pool;
use crate::clipper::t_edge::TEdge;
use crate::geometry::point::Point;
use std::ptr;
pub struct IntersectNode {
    pub edge1: *mut TEdge,
    pub edge2: *mut TEdge,
    pub pt: Point<i32>,
}

impl ClipperInstance for IntersectNode {
    fn new() -> Self {
        Self {
            edge1: ptr::null_mut(),
            edge2: ptr::null_mut(),
            pt: Point::<i32>::new(None, None),
        }
    }

    fn clean(&mut self) {
        self.edge1 = ptr::null_mut();
        self.edge2 = ptr::null_mut();

        unsafe {
            self.pt.set(0, 0);
        }
    }
}

impl IntersectNode {
    pub unsafe fn create(
        edge1: *mut TEdge,
        edge2: *mut TEdge,
        point: Option<*const Point<i32>>,
    ) -> *mut Self {
        let result = get_pool().intersect_node_pool.get();

        (*result).edge1 = edge1;
        (*result).edge2 = edge2;

        if let Some(p) = point {
            (*result).pt.update(p);
        } else {
            (*result).pt.set(0, 0);
        };

        result
    }

    pub unsafe fn edges_adjacent(&self) -> bool {
        ptr::eq((*self.edge1).next_in_sel, self.edge2) || ptr::eq((*self.edge1).prev_in_sel, self.edge2)
    }

    pub fn sort(a: *mut IntersectNode, b: *mut IntersectNode) -> std::cmp::Ordering {
        unsafe { (*b).pt.y.cmp(&(*a).pt.y) }
    }
}
