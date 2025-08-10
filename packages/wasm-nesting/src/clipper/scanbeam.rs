use std::collections::VecDeque;
pub struct Scanbeam {
    values: VecDeque<i32>,
}

impl Scanbeam {
    pub fn new() -> Self {
        Self {
            values: VecDeque::new(),
        }
    }

    pub fn insert(&mut self, y: i32) {
        for (i, &value) in self.values.iter().enumerate() {
            if y == value {
                return;
            }

            if y > value {
                self.values.insert(i, y);
                return;
            }
        }

        self.values.push_back(y);
    }

    pub fn pop(&mut self) -> i32 {
        if self.is_empty() {
            panic!("Scanbeam is empty");
        }

        self.values.pop_front().unwrap()
    }

    pub fn clean(&mut self) {
        self.values.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    pub fn len(&self) -> usize {
        self.values.len()
    }
}
