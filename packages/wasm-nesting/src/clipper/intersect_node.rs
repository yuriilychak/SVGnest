/// IntersectNode structure for managing intersection nodes in polygon clipping
/// Equivalent to TypeScript IntersectNode class from packages/geometry-utils/src/clipper/intersect-node.ts
///
/// Type mappings:
/// - i32: Represents X and Y coordinate values
/// - usize: Represents edge indices for polygon edge references
/// - Vec<(usize, usize, i32, i32)>: Array of tuples representing [edge1Index, edge2Index, x, y]
#[derive(Debug, Clone)]
pub struct IntersectNode {
    /// Array of tuples containing (edge1_index, edge2_index, x, y) for intersection nodes
    /// Type: Vec<(usize, usize, i32, i32)> (equivalent to TypeScript number[][])
    items: Vec<(usize, usize, i32, i32)>,
}

impl Default for IntersectNode {
    fn default() -> Self {
        Self::new()
    }
}

impl IntersectNode {
    /// Creates a new empty IntersectNode instance
    /// Equivalent to TypeScript constructor()
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    /// Adds a new intersection node entry
    ///
    /// # Arguments
    /// * `edge1_index` - The first edge index (usize)
    /// * `edge2_index` - The second edge index (usize)
    /// * `x` - The X coordinate of the intersection (i32)
    /// * `y` - The Y coordinate of the intersection (i32)
    ///
    /// Equivalent to TypeScript add(edg1Index: usize, edge2Index: usize, x: i32, y: i32): void
    pub fn add(&mut self, edge1_index: usize, edge2_index: usize, x: i32, y: i32) {
        self.items.push((edge1_index, edge2_index, x, y));
    }

    /// Swaps two intersection node entries at the specified indices
    ///
    /// # Arguments
    /// * `index1` - The first index to swap (usize)
    /// * `index2` - The second index to swap (usize)
    ///
    /// # Panics
    /// * Panics if either index is out of bounds
    ///
    /// Equivalent to TypeScript swap(index1: usize, index2: usize): void
    pub fn swap(&mut self, index1: usize, index2: usize) {
        let idx1 = index1 as usize;
        let idx2 = index2 as usize;
        self.items.swap(idx1, idx2);
    }

    /// Sorts the intersection nodes by Y coordinate in descending order
    /// The Y coordinate is at index 3 in the tuple (edge1_index, edge2_index, x, y)
    ///
    /// Equivalent to TypeScript sort(): void
    /// Original comment: "the following typecast is safe because the differences in Pt.Y will
    /// be limited to the height of the scanbeam."
    pub fn sort(&mut self) {
        self.items.sort_by(|node1, node2| {
            // Sort by Y coordinate in descending order (node2.y - node1.y)
            // node2[3] - node1[3] in TypeScript becomes node2.3 - node1.3 in Rust
            node2.3.cmp(&node1.3)
        });
    }

    /// Clears all intersection node entries
    /// Equivalent to TypeScript clean(): void
    pub fn clean(&mut self) {
        self.items.clear();
    }

    /// Gets the first edge index at the specified position
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the edge1 index from (usize)
    ///
    /// # Returns
    /// * `usize` - The first edge index
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getEdge1Index(index: usize): usize
    pub fn get_edge1_index(&self, index: usize) -> usize {
        self.items[index as usize].0
    }

    /// Gets the second edge index at the specified position
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the edge2 index from (usize)
    ///
    /// # Returns
    /// * `usize` - The second edge index
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getEdge2Index(index: usize): usize
    pub fn get_edge2_index(&self, index: usize) -> usize {
        self.items[index as usize].1
    }

    /// Gets the X coordinate at the specified position
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the X coordinate from (usize)
    ///
    /// # Returns
    /// * `i32` - The X coordinate
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getX(index: usize): i32
    pub fn get_x(&self, index: usize) -> i32 {
        self.items[index as usize].2
    }

    /// Gets the Y coordinate at the specified position
    ///
    /// # Arguments
    /// * `index` - The index to retrieve the Y coordinate from (usize)
    ///
    /// # Returns
    /// * `i32` - The Y coordinate
    ///
    /// # Panics
    /// * Panics if index is out of bounds
    ///
    /// Equivalent to TypeScript getY(index: usize): i32
    pub fn get_y(&self, index: usize) -> i32 {
        self.items[index as usize].3
    }

    /// Gets the number of intersection node entries
    ///
    /// # Returns
    /// * `usize` - The number of entries
    ///
    /// Equivalent to TypeScript get length(): usize
    pub fn length(&self) -> usize {
        self.items.len() as usize
    }

    /// Checks if the intersection node list is empty
    ///
    /// # Returns
    /// * `bool` - True if empty, false otherwise
    ///
    /// Equivalent to TypeScript get isEmpty(): boolean
    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}
