use crate::constants::POOL_SIZE;
use crate::geometry::point::Point;
use crate::utils::number::Number;
use crate::utils::bit_ops::highest_bit_index;

pub struct PointPool<T: Number> {
    items: Box<[Point<T>]>,
    used: u32,
}

impl<T: Number> PointPool<T> {
    pub fn new() -> Self {
        let mut buffer = vec![T::zero(); POOL_SIZE * 2].into_boxed_slice();
        let ptr = buffer.as_mut_ptr();
        let mut items_vec = Vec::with_capacity(POOL_SIZE);
        for i in 0..POOL_SIZE {
            items_vec.push(Point::<T>::new(ptr, i * 2));
        }
        let items = items_vec.into_boxed_slice();
        Self { items, used: 0 }
    }

    pub fn alloc(&mut self, count: usize) -> u32 {
        let mut result = 0u32;
        let mut current_count = 0;
        let mut free_bits = !self.used;
        while free_bits != 0 {
            let bit = highest_bit_index(free_bits);
            let mask = 1 << bit;
            result |= mask;
            free_bits &= !mask;
            current_count += 1;

            if current_count == count {
                self.used |= result;
                return result;
            }
        }
        panic!("PointPool: out of space");
    }

    pub fn malloc(&mut self, mask: u32) {
        self.used &= !mask;
    }

    pub fn get(&mut self, mask: u32, index: u8) -> *mut Point<T> {
        let mut current_index = 0;
        let mut bit_mask = mask;
        while bit_mask != 0 {
            let bit = highest_bit_index(bit_mask);
            let flag = 1 << bit;
            if current_index == index {
                return &mut self.items[bit as usize] as *mut Point<T>;
            }
            bit_mask &= !flag;
            current_index += 1;
        }
        panic!("PointPool::get: index out of bounds");
    }
}
