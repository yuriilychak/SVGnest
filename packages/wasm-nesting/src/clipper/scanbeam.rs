/// Scanbeam structure for managing Y-coordinate values in ascending order
/// Equivalent to TypeScript Scanbeam class from packages/geometry-utils/src/clipper/scanbeam.ts
#[derive(Debug, Clone)]
pub struct Scanbeam {
    /// Array of i32 values representing Y-coordinates
    /// Type: Vec<i32> (equivalent to TypeScript i32[])
    values: Vec<i32>,
}

impl Default for Scanbeam {
    fn default() -> Self {
        Self::new()
    }
}

impl Scanbeam {
    /// Creates a new empty Scanbeam instance
    /// Equivalent to TypeScript constructor()
    pub fn new() -> Self {
        Self { values: Vec::new() }
    }

    /// Inserts a Y-coordinate value into the scanbeam in descending order
    /// Avoids duplicate values
    ///
    /// # Arguments
    /// * `y` - The Y-coordinate value to insert (i32)
    ///
    /// Equivalent to TypeScript insert(y: i32): void
    pub fn insert(&mut self, y: i32) {
        for i in 0..self.values.len() {
            if y == self.values[i] {
                return;
            }

            if y > self.values[i] {
                self.values.insert(i, y);
                return;
            }
        }

        self.values.push(y);
    }

    /// Removes and returns the first (highest) value from the scanbeam
    ///
    /// # Returns
    /// * `i32` - The highest Y-coordinate value
    ///
    /// # Panics
    /// * Panics if the scanbeam is empty
    ///
    /// Equivalent to TypeScript pop(): i32
    pub fn pop(&mut self) -> i32 {
        if self.is_empty() {
            panic!("ScanbeamManager is empty");
        }

        self.values.remove(0)
    }

    /// Clears all values from the scanbeam
    /// Equivalent to TypeScript clean(): void
    pub fn clean(&mut self) {
        self.values.clear();
    }

    /// Checks if the scanbeam is empty
    ///
    /// # Returns
    /// * `bool` - True if empty, false otherwise
    ///
    /// Equivalent to TypeScript get isEmpty(): boolean
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }
}
