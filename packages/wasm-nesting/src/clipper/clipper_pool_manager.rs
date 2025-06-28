use crate::clipper::clipper_pool::ClipperPool;
use crate::clipper::intersect_node::IntersectNode;
use crate::clipper::join::Join;
use crate::clipper::local_minima::LocalMinima;
use crate::clipper::out_pt::OutPt;
use crate::clipper::out_rec::OutRec;
use crate::clipper::scanbeam::Scanbeam;
use crate::clipper::t_edge::TEdge;
use std::cell::RefCell;

pub struct ClipperPoolManager {
    pub intersect_node_pool: ClipperPool<IntersectNode>,
    pub join_pool: ClipperPool<Join>,
    pub local_minima_pool: ClipperPool<LocalMinima>,
    pub out_pt_pool: ClipperPool<OutPt>,
    pub out_rec_pool: ClipperPool<OutRec>,
    pub scanbeam_pool: ClipperPool<Scanbeam>,
    pub t_edge_pool: ClipperPool<TEdge>,
}

impl ClipperPoolManager {
    pub fn new() -> Self {
        Self {
            intersect_node_pool: ClipperPool::new(),
            join_pool: ClipperPool::new(),
            local_minima_pool: ClipperPool::new(),
            out_pt_pool: ClipperPool::new(),
            out_rec_pool: ClipperPool::new(),
            scanbeam_pool: ClipperPool::new(),
            t_edge_pool: ClipperPool::new(),
        }
    }

    pub fn drain(&mut self) {
        self.intersect_node_pool.drain();
        self.join_pool.drain();
        self.local_minima_pool.drain();
        self.out_pt_pool.drain();
        self.out_rec_pool.drain();
        self.scanbeam_pool.drain();
        self.t_edge_pool.drain();
    }
}

thread_local! {
    static CLIPPER_POOL: RefCell<Option<ClipperPoolManager>> = RefCell::new(None);
}

pub fn get_pool() -> &'static mut ClipperPoolManager {
    thread_local! {
        static POOL_PTR: RefCell<*mut ClipperPoolManager> = RefCell::new(std::ptr::null_mut());
    }

    POOL_PTR.with(|ptr| {
        let mut stored = ptr.borrow_mut();

        if stored.is_null() {
            CLIPPER_POOL.with(|global| {
                let mut global_ref = global.borrow_mut();
                *global_ref = Some(ClipperPoolManager::new());
                *stored = global_ref.as_mut().unwrap() as *mut _;
            });
        }

        unsafe { &mut **stored }
    })
}
