use crate::clipper::enums::Direction;
use crate::clipper::scanbeam::Scanbeam;
use crate::clipper::t_edge::TEdge;
use std::ptr;

#[derive(Debug)]
pub struct LocalMinima {
    pub y: i32,
    pub left_bound: *mut TEdge,
    pub right_bound: *mut TEdge,
    pub next: Option<Box<LocalMinima>>,
}

impl LocalMinima {
    pub fn new(
        y: i32,
        left_bound: Option<*mut TEdge>,
        right_bound: Option<*mut TEdge>,
        next: Option<Box<LocalMinima>>,
    ) -> Box<Self> {
        Box::new(Self {
            y,
            left_bound: left_bound.unwrap_or(ptr::null_mut()),
            right_bound: right_bound.unwrap_or(ptr::null_mut()),
            next,
        })
    }

    pub fn insert(
        self: Box<Self>,
        mut current: Option<Box<LocalMinima>>,
    ) -> Option<Box<LocalMinima>> {
        if current.is_none() || self.y >= current.as_ref().unwrap().y {
            let mut new_self = self;
            new_self.next = current;
            return Some(new_self);
        }

        let mut node = current.as_mut().unwrap();

        loop {
            let should_insert = match node.next {
                Some(ref next_node) if self.y < next_node.y => false,
                _ => true,
            };

            if should_insert {
                break;
            }

            // safe unwrap, бо ми щойно перевірили, що next існує
            node = node.next.as_mut().unwrap();
        }

        let mut new_self = self;
        new_self.next = node.next.take();
        node.next = Some(new_self);

        current
    }

    pub unsafe fn reset(&mut self) {
        let mut lm: *mut LocalMinima = self;

        while !lm.is_null() {
            if !(*lm).left_bound.is_null() {
                (*(*lm).left_bound).reset(Direction::Left);
            }

            if !(*lm).right_bound.is_null() {
                (*(*lm).right_bound).reset(Direction::Right);
            }

            lm = match &mut (*lm).next {
                Some(next_box) => &mut **next_box,
                None => std::ptr::null_mut(),
            };
        }
    }

    pub fn get_scanbeam(&self) -> Option<Box<Scanbeam>> {
        let mut lm: Option<&LocalMinima> = Some(self);
        let mut result: Option<Box<Scanbeam>> = None;

        while let Some(curr) = lm {
            result = Some(Scanbeam::insert(curr.y, result));
            lm = curr.next.as_deref();
        }

        result
    }
}
