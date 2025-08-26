use crate::geometry::point::Point;

pub struct Join {
    // (x, y, hash1, hash2)
    joins: Vec<(i32, i32, u32, u32)>,
    // (x, y, hash1)
    ghost_joins: Vec<(i32, i32, u32)>,
}

impl Join {
    pub fn new() -> Self {
        Self { joins: Vec::new(), ghost_joins: Vec::new() }
    }

    #[inline]
    pub fn len(&self, is_ghost: bool) -> usize {
        if is_ghost { self.ghost_joins.len() } else { self.joins.len() }
    }

    #[inline]
    pub fn get_x(&self, index: usize, is_ghost: bool) -> i32 {
        if is_ghost { self.ghost_joins[index].0 } else { self.joins[index].0 }
    }

    #[inline]
    pub fn get_y(&self, index: usize, is_ghost: bool) -> i32 {
        if is_ghost { self.ghost_joins[index].1 } else { self.joins[index].1 }
    }

    #[inline]
    pub fn get_hash1(&self, index: usize, is_ghost: bool) -> u32 {
        if is_ghost { self.ghost_joins[index].2 } else { self.joins[index].2 }
    }

    // Only for real joins (ghosts don't have hash2)
    #[inline]
    pub fn get_hash2(&self, index: usize) -> u32 {
        self.joins[index].3
    }

    // Copy from ghost_joins[index] into joins with provided hash2 (does NOT remove the ghost).
    #[inline]
    pub fn from_ghost(&mut self, index: usize, hash2: u32) {
        let (x, y, hash1) = self.ghost_joins[index];
        self.joins.push((x, y, hash1, hash2));
    }

    // Variant that MOVES (removes) the ghost in O(1).
    #[inline]
    pub fn take_from_ghost(&mut self, index: usize, hash2: u32) {
        let (x, y, hash1) = self.ghost_joins.swap_remove(index);
        self.joins.push((x, y, hash1, hash2));
    }

    // Adjust Point path/type as needed.
    #[inline]
    pub fn add(&mut self, out_hash1: u32, out_hash2: u32, point: &Point<i32>) {
        self.joins.push((point.x, point.y, out_hash1, out_hash2));
    }

    #[inline]
    pub fn add_ghost(&mut self, hash1: u32, x: i32, y: i32) {
        self.ghost_joins.push((x, y, hash1));
    }

    #[inline]
    pub fn update_hash(&mut self, index: usize, hash1: u32, hash2: u32) {
        let j = &mut self.joins[index];
        j.2 = hash1;
        j.3 = hash2;
    }

    #[inline]
    pub fn reset(&mut self) {
        self.joins.clear();
        self.ghost_joins.clear();
    }

    #[inline]
    pub fn clear_ghosts(&mut self) {
        self.ghost_joins.clear();
    }
}