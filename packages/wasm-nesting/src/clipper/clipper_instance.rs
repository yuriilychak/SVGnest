pub trait ClipperInstance {
    fn new() -> Self;
    fn clean(&mut self);
}
