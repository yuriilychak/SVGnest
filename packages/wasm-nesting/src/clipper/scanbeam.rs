use crate::clipper::clipper_instance::ClipperInstance;
use crate::clipper::clipper_pool_manager::get_pool;
use std::ptr;
pub struct Scanbeam {
    pub y: i32,
    pub next: *mut Scanbeam,
}

impl ClipperInstance for Scanbeam {
    fn new() -> Self {
        Self {
            y: 0,
            next: ptr::null_mut(),
        }
    }

    fn clean(&mut self) {
        self.y = 0;
        self.next = ptr::null_mut();
    }
}

impl Scanbeam {
    pub unsafe fn create(y: i32, next: *mut Scanbeam) -> *mut Self {
        let result = get_pool().scanbeam_pool.get();

        (*result).y = y;
        (*result).next = next;

        result
    }

    pub unsafe fn insert(y: i32, input_scanbeam: *mut Scanbeam) -> *mut Scanbeam {
        if input_scanbeam.is_null() {
            return Scanbeam::create(y, ptr::null_mut());
        }

        if y > (*input_scanbeam).y {
            return Scanbeam::create(y, input_scanbeam);
        }

        let mut scanbeam = input_scanbeam;

        while !(*scanbeam).next.is_null() && y <= (*(*scanbeam).next).y {
            scanbeam = (*scanbeam).next;
        }

        if y != (*scanbeam).y {
            //ie ignores duplicates
            (*scanbeam).next = Scanbeam::create(y, (*scanbeam).next);
        }

        input_scanbeam
    }
}
