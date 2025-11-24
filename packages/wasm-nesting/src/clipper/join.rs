use crate::geometry::point::Point;

/// Join structure for managing join operations in polygon clipping
/// Equivalent to TypeScript Join class from packages/geometry-utils/src/clipper/join.ts
///
/// Type mappings:
/// - i32: Represents X and Y coordinate values
/// - usize: Represents hash indices for output polygon references
/// - Vec<(i32, i32, usize, usize)>: Array of tuples representing [x, y, outHash1, outHash2] for joins
/// - Vec<(i32, i32, usize)>: Array of tuples representing [x, y, hash] for ghost joins
#[derive(Debug, Clone)]
pub struct Join {
    /// Array of tuples containing (x, y, out_hash1, out_hash2) for regular joins
    /// Type: Vec<(i32, i32, usize, usize)> (equivalent to TypeScript number[][])
    joins: Vec<(i32, i32, usize, usize)>,

    /// Array of tuples containing (x, y, hash) for ghost joins
    /// Type: Vec<(i32, i32, usize)> (equivalent to TypeScript number[][])
    ghost_joins: Vec<(i32, i32, usize)>,
}

impl Default for Join {
    fn default() -> Self {
        Self::new()
    }
}

impl Join {
    /// Creates a new empty Join instance
    /// Equivalent to TypeScript constructor()
    pub fn new() -> Self {
        Self {
            joins: Vec::new(),
            ghost_joins: Vec::new(),
        }
    }

    /// Gets the length of either joins or ghost joins array
    ///
    /// # Arguments
    /// * `is_ghost` - If true, returns ghost joins length; if false, returns regular joins length
    ///
    /// # Returns
    /// * `usize` - The length of the specified array
    ///
    /// Equivalent to TypeScript getLength(isGhost: boolean): number
    pub fn get_length(&self, is_ghost: bool) -> usize {
        if is_ghost {
            self.ghost_joins.len() as usize
        } else {
            self.joins.len() as usize
        }
    }

    /// Gets the X coordinate value at the specified index
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the X value from (usize)
    /// * `is_ghost` - If true, gets from ghost joins; if false, gets from regular joins
    ///
    /// # Returns
    /// * `i32` - The X coordinate value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getX(index: usize, isGhost: boolean): i32
    pub fn get_x(&self, index: usize, is_ghost: bool) -> i32 {
        if is_ghost {
            self.ghost_joins[index as usize].0
        } else {
            self.joins[index as usize].0
        }
    }

    /// Gets the Y coordinate value at the specified index
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the Y value from (usize)
    /// * `is_ghost` - If true, gets from ghost joins; if false, gets from regular joins
    ///
    /// # Returns
    /// * `i32` - The Y coordinate value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getY(index: usize, isGhost: boolean): i32
    pub fn get_y(&self, index: usize, is_ghost: bool) -> i32 {
        if is_ghost {
            self.ghost_joins[index as usize].1
        } else {
            self.joins[index as usize].1
        }
    }

    /// Gets the first hash value at the specified index
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the hash from (usize)
    /// * `is_ghost` - If true, gets from ghost joins; if false, gets from regular joins
    ///
    /// # Returns
    /// * `usize` - The first hash value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getHash1(index: usize, isGhost: boolean): usize
    pub fn get_hash1(&self, index: usize, is_ghost: bool) -> usize {
        if is_ghost {
            self.ghost_joins[index as usize].2
        } else {
            self.joins[index as usize].2
        }
    }

    /// Gets the second hash value at the specified index (only available for regular joins)
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the hash from (usize)
    ///
    /// # Returns
    /// * `usize` - The second hash value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getHash2(index: usize): usize
    pub fn get_hash2(&self, index: usize) -> usize {
        self.joins[index as usize].3
    }

    /// Creates a regular join from a ghost join entry
    ///
    /// # Arguments
    /// * `index` - The index of the ghost join to convert (usize)
    /// * `hash` - The second hash value to add (usize)
    ///
    /// Equivalent to TypeScript fromGhost(index: usize, hash: usize): void
    pub fn from_ghost(&mut self, index: usize, hash: usize) {
        let ghost_entry = &self.ghost_joins[index as usize];
        self.joins.push((
            ghost_entry.0, // x
            ghost_entry.1, // y
            ghost_entry.2, // hash1
            hash,          // hash2
        ));
    }

    /// Adds a new regular join entry
    ///
    /// # Arguments
    /// * `out_hash1` - The first output hash (usize)
    /// * `out_hash2` - The second output hash (usize)
    /// * `point` - The point containing x and y coordinates
    ///
    /// Equivalent to TypeScript add(outHash1: usize, outHash2: usize, point: Point<Int32Array>): void
    pub fn add(&mut self, out_hash1: usize, out_hash2: usize, point: &Point<i32>) {
        self.joins.push((point.x, point.y, out_hash1, out_hash2));
    }

    /// Adds a new ghost join entry
    ///
    /// # Arguments
    /// * `hash` - The hash value (usize)
    /// * `x` - The X coordinate (i32)
    /// * `y` - The Y coordinate (i32)
    ///
    /// Equivalent to TypeScript addGhost(hash: usize, x: i32, y: i32): void
    pub fn add_ghost(&mut self, hash: usize, x: i32, y: i32) {
        self.ghost_joins.push((x, y, hash));
    }

    /// Updates the hash values for a regular join at the specified index
    ///
    /// # Arguments
    /// * `index` - The index of the join to update (usize)
    /// * `hash1` - The new first hash value (usize)
    /// * `hash2` - The new second hash value (usize)
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript updateHash(index: usize, hash1: usize, hash2: usize): void
    pub fn update_hash(&mut self, index: usize, hash1: usize, hash2: usize) {
        let entry = &mut self.joins[index as usize];
        entry.2 = hash1;
        entry.3 = hash2;
    }

    /// Clears both regular joins and ghost joins arrays
    /// Equivalent to TypeScript reset(): void
    pub fn reset(&mut self) {
        self.joins.clear();
        self.ghost_joins.clear();
    }

    /// Clears only the ghost joins array
    /// Equivalent to TypeScript clearGhosts(): void
    pub fn clear_ghosts(&mut self) {
        self.ghost_joins.clear();
    }

    /// Gets the number of regular joins
    ///
    /// # Returns
    /// * `usize` - The number of regular joins
    pub fn joins_len(&self) -> usize {
        self.joins.len() as usize
    }

    /// Gets the number of ghost joins
    ///
    /// # Returns
    /// * `usize` - The number of ghost joins
    pub fn ghost_joins_len(&self) -> usize {
        self.ghost_joins.len() as usize
    }

    /// Checks if both joins and ghost joins are empty
    ///
    /// # Returns
    /// * `bool` - True if both arrays are empty, false otherwise
    pub fn is_empty(&self) -> bool {
        self.joins.is_empty() && self.ghost_joins.is_empty()
    }

    /// Checks if regular joins array is empty
    ///
    /// # Returns
    /// * `bool` - True if joins array is empty, false otherwise
    pub fn joins_is_empty(&self) -> bool {
        self.joins.is_empty()
    }

    /// Checks if ghost joins array is empty
    ///
    /// # Returns
    /// * `bool` - True if ghost joins array is empty, false otherwise
    pub fn ghost_joins_is_empty(&self) -> bool {
        self.ghost_joins.is_empty()
    }
}
