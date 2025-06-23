use crate::clipper::clipper_base::ClipperBase;
use crate::clipper::enums::{ClipType, PolyFillType};
use crate::clipper::intersect_node::IntersectNode;
use crate::clipper::join::Join;
use crate::clipper::local_minima::LocalMinima;
use crate::clipper::out_pt::OutPt;
use crate::clipper::out_rec::OutRec;
use crate::clipper::scanbeam::Scanbeam;
use crate::clipper::t_edge::TEdge;

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
}
