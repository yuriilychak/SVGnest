#[derive(Debug)]
pub struct IntersectNode {
    items: Vec<(isize, isize, i32, i32)>,
}

impl IntersectNode {
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    pub fn add(&mut self, edge1_index: isize, edge2_index: isize, x: i32, y: i32) {
        self.items.push((edge1_index, edge2_index, x, y));
    }

    pub fn swap(&mut self, index1: usize, index2: usize) {
        self.items.swap(index1, index2);
    }

    pub fn sort(&mut self) {
        // Sort by y value in descending order (node2[3] - node1[3])
        self.items.sort_by(|node1, node2| node2.3.cmp(&node1.3));
    }

    pub fn clean(&mut self) {
        self.items.clear();
    }

    pub fn get_edge1_index(&self, index: usize) -> isize {
        self.items[index].0
    }

    pub fn get_edge2_index(&self, index: usize) -> isize {
        self.items[index].1
    }

    pub fn get_x(&self, index: usize) -> i32 {
        self.items[index].2
    }

    pub fn get_y(&self, index: usize) -> i32 {
        self.items[index].3
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}