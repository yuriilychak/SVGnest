use std::collections::VecDeque;

pub struct LocalMinima {
    items: VecDeque<(i32, isize, isize)>,
}

impl LocalMinima {
    pub fn new() -> Self {
        Self { items: VecDeque::new() }
    }

    pub fn get_left_bound(&self, index: usize) -> isize {
        self.items[index].1
    }

    pub fn get_right_bound(&self, index: usize) -> isize {
        self.items[index].2
    }

    pub fn get_y(&self, index: usize) -> i32 {
        self.items[index].0
    }

    pub fn insert(&mut self, y: i32, left: isize, right: isize) -> usize {
        let local_minima = (y, left, right);

        for (i, _) in self.items.iter().enumerate() {
            if y >= self.get_y(i) {
                self.items.insert(i, local_minima);
                return i;
            }
        }

        self.items.push_back(local_minima);
        self.items.len() - 1
    }

    pub fn pop(&mut self) -> (isize, isize) {
        if self.is_empty() {
            panic!("No minima to pop");
        }

        let result = (self.get_left_bound(0), self.get_right_bound(0));
        self.items.pop_front();

        result
    }

    pub fn min_y(&self) -> Option<i32> {
        if self.is_empty() {
            None
        } else {
            Some(self.get_y(0))
        }
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }
}
