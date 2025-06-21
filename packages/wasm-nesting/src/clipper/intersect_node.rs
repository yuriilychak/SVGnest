use crate::clipper::t_edge::TEdge;
use crate::geometry::point::Point;

#[derive(Debug, PartialEq)]
pub struct IntersectNode {
    pub edge1: *mut TEdge,
    pub edge2: *mut TEdge,
    pub pt: Point<i32>,
}

impl IntersectNode {
    pub fn new(edge1: *mut TEdge, edge2: *mut TEdge, point: Option<*const Point<i32>>) -> Self {
        let pt = if let Some(p) = point {
            Point::<i32>::from(p)
        } else {
            Point::<i32>::new(None, None)
        };

        Self { edge1, edge2, pt }
    }

    pub unsafe fn edges_adjacent(&self) -> bool {
        (*self.edge1).next_in_sel == self.edge2 || (*self.edge1).prev_in_sel == self.edge2
    }

    pub fn sort(node1: &IntersectNode, node2: &IntersectNode) -> i32 {
        node2.pt.y - node1.pt.y
    }
}
