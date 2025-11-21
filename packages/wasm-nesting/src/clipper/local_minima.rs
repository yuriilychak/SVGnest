/// LocalMinima structure for managing Y-coordinate minima with associated bounds
/// Equivalent to TypeScript LocalMinima class from packages/geometry-utils/src/clipper/local-minima.ts
///
/// Type mappings:
/// - i32: Represents Y-coordinate values
/// - isize: Represents bound indices (left and right)
/// - Vec<(i32, isize, isize)>: Array of tuples representing [y, left, right] items
#[derive(Debug, Clone)]
pub struct LocalMinima {
    /// Array of tuples containing (y, left_bound, right_bound)
    /// Type: Vec<(i32, isize, isize)> (equivalent to TypeScript number[][])
    items: Vec<(i32, isize, isize)>,
}

impl Default for LocalMinima {
    fn default() -> Self {
        Self::new()
    }
}

impl LocalMinima {
    /// Creates a new empty LocalMinima instance
    /// Equivalent to TypeScript constructor()
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    /// Gets the left bound at the specified index
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the left bound from (isize)
    ///
    /// # Returns
    /// * `isize` - The left bound value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getLeftBound(index: isize): isize
    pub fn get_left_bound(&self, index: isize) -> isize {
        self.items[index as usize].1
    }

    /// Gets the right bound at the specified index
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the right bound from (isize)
    ///
    /// # Returns
    /// * `isize` - The right bound value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getRightBound(index: isize): isize
    pub fn get_right_bound(&self, index: isize) -> isize {
        self.items[index as usize].2
    }

    /// Gets the Y-coordinate value at the specified index
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the Y value from (isize)
    ///
    /// # Returns
    /// * `i32` - The Y-coordinate value
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getY(index: isize): i32
    pub fn get_y(&self, index: isize) -> i32 {
        self.items[index as usize].0
    }

    /// Inserts a new local minima entry in descending Y order
    /// Higher Y values are inserted at the beginning
    ///
    /// # Arguments
    /// * `y` - The Y-coordinate value (i32)
    /// * `left` - The left bound index (isize)
    /// * `right` - The right bound index (isize)
    ///
    /// # Returns
    /// * `isize` - The index where the item was inserted
    ///
    /// Equivalent to TypeScript insert(y: i32, left: isize, right: isize): isize
    pub fn insert(&mut self, y: i32, left: isize, right: isize) -> isize {
        let local_minima = (y, left, right);

        for i in 0..self.items.len() {
            if y >= self.get_y(i as isize) {
                self.items.insert(i, local_minima);
                return i as isize;
            }
        }

        self.items.push(local_minima);
        (self.items.len() - 1) as isize
    }

    /// Removes and returns the first (highest Y) local minima as a tuple of bounds
    ///
    /// # Returns
    /// * `(isize, isize)` - Tuple containing (left_bound, right_bound)
    ///
    /// # Panics
    /// * Panics if the local minima is empty
    ///
    /// Equivalent to TypeScript pop(): isize[] (returns tuple instead of array)
    pub fn pop(&mut self) -> (isize, isize) {
        if self.is_empty() {
            panic!("No minima to pop");
        }

        let result = (self.get_left_bound(0), self.get_right_bound(0));
        self.items.remove(0);
        result
    }

    /// Gets the minimum (highest) Y-coordinate value
    ///
    /// # Returns
    /// * `Option<i32>` - The minimum Y value, or None if empty
    ///
    /// Note: TypeScript version returns NaN for empty, Rust uses Option for safety
    /// Equivalent to TypeScript get minY(): i32
    pub fn min_y(&self) -> Option<i32> {
        if self.items.is_empty() {
            None
        } else {
            Some(self.get_y(0))
        }
    }

    /// Checks if the local minima is empty
    ///
    /// # Returns
    /// * `bool` - True if empty, false otherwise
    ///
    /// Equivalent to TypeScript get isEmpty(): boolean
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Gets the number of items in the local minima
    ///
    /// # Returns
    /// * `isize` - The length of the items array
    ///
    /// Equivalent to TypeScript get length(): isize
    pub fn length(&self) -> isize {
        self.items.len() as isize
    }
}
