use crate::clipper::clipper_instance::ClipperInstance;
use crate::clipper::clipper_pool_manager::get_pool;
use crate::clipper::enums::Direction;
use crate::clipper::scanbeam::Scanbeam;
use crate::clipper::t_edge::TEdge;
use std::ptr;

pub struct LocalMinima {
    pub y: i32,
    pub left_bound: *mut TEdge,
    pub right_bound: *mut TEdge,
    pub next: *mut LocalMinima,
}

impl ClipperInstance for LocalMinima {
    fn new() -> Self {
        Self {
            y: 0,
            left_bound: ptr::null_mut(),
            right_bound: ptr::null_mut(),
            next: ptr::null_mut(),
        }
    }

    fn clean(&mut self) {
        self.y = 0;
        self.left_bound = ptr::null_mut();
        self.right_bound = ptr::null_mut();
        self.next = ptr::null_mut();
    }
}

impl LocalMinima {
    pub unsafe fn create(
        y: i32,
        left_bound: Option<*mut TEdge>,
        right_bound: Option<*mut TEdge>,
        next: Option<*mut LocalMinima>,
    ) -> *mut Self {
        let result = get_pool().local_minima_pool.get();

        (*result).y = y;
        (*result).left_bound = left_bound.unwrap_or(ptr::null_mut());
        (*result).right_bound = right_bound.unwrap_or(ptr::null_mut());
        (*result).next = next.unwrap_or(ptr::null_mut());

        result
    }

    pub unsafe fn insert(&mut self, current: *mut LocalMinima) -> *mut LocalMinima {
        if current.is_null() {
            return self as *mut LocalMinima;
        }

        if self.y >= (*current).y {
            self.next = current;

            return self as *mut LocalMinima;
        }

        let mut local_minima = current;

        while !(*local_minima).next.is_null() && self.y < (*(*local_minima).next).y {
            local_minima = (*local_minima).next;
        }

        self.next = (*local_minima).next;
        (*local_minima).next = self as *mut LocalMinima;

        return current;
    }

    pub unsafe fn reset(&mut self) {
        let mut local_minima = self as *mut LocalMinima;

        while !local_minima.is_null() {
            if !(*local_minima).left_bound.is_null() {
                (*(*local_minima).left_bound).reset(Direction::Left);
            }

            if !(*local_minima).right_bound.is_null() {
                (*(*local_minima).right_bound).reset(Direction::Right);
            }

            local_minima = (*local_minima).next;
        }
    }

    pub unsafe fn get_scanbeam(&mut self) -> *mut Scanbeam {
        let mut local_minima = self as *mut LocalMinima;
        let mut result: *mut Scanbeam = ptr::null_mut();

        while !local_minima.is_null() {
            result = Scanbeam::insert((*local_minima).y, result);
            local_minima = (*local_minima).next;
        }

        result
    }
}
