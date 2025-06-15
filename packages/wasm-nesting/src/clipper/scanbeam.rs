#[derive(Debug)]
pub struct Scanbeam {
    pub y: i32,
    pub next: Option<Box<Scanbeam>>,
}

impl Scanbeam {
    pub fn new(y: i32, next: Option<Box<Scanbeam>>) -> Box<Self> {
        Box::new(Scanbeam { y, next })
    }

    pub fn insert(y: i32, input_scanbeam: Option<Box<Scanbeam>>) -> Box<Scanbeam> {
        match input_scanbeam {
            None => Scanbeam::new(y, None),
            Some(mut head) => {
                if y > head.y {
                    return Scanbeam::new(y, Some(head));
                }
    
                let mut current = &mut head;
                while let Some(next) = current.next.as_ref() {
                    if y > next.y {
                        break;
                    }
                    if y == next.y {
                        return head; // duplicates are ignored
                    }
                    current = current.next.as_mut().unwrap();
                }
    
                let next = current.next.take();
                current.next = Some(Scanbeam::new(y, next));
                head
            }
        }
    }
}