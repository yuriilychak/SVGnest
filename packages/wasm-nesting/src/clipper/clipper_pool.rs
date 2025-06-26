use crate::clipper::clipper_instance::ClipperInstance;

pub struct ClipperPool<T: ClipperInstance> {
    pub instances: Vec<Box<T>>,
    pub used: Vec<bool>,
}

impl<T: ClipperInstance> ClipperPool<T> {
    pub fn new() -> Self {
        Self {
            instances: Vec::new(),
            used: Vec::new(),
        }
    }

    pub fn get(&mut self) -> *mut T {
        for (i, used) in self.used.iter_mut().enumerate() {
            if !*used {
                *used = true;
                return &mut *self.instances[i];
            }
        }

        let mut new_obj = Box::new(T::new());
        let ptr: *mut T = &mut *new_obj;
        self.instances.push(new_obj);
        self.used.push(true);
        ptr
    }

    pub fn put(&mut self, ptr: *mut T) {
        for (i, b) in self.instances.iter_mut().enumerate() {
            if &mut **b as *mut T == ptr {
                b.clean();
                self.used[i] = false;
                break;
            }
        }
    }

    pub fn drain(&mut self) {
        for b in self.instances.iter_mut() {
            b.clean();
        }
        self.instances.clear();
        self.used.clear();
    }
}
