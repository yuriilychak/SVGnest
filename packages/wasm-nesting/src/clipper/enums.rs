#[repr(u8)]
pub enum PolyFillType {
    EvenOdd = 0,
    NonZero = 1,
    Positive = 2,
    Negative = 3,
}

#[repr(u8)]
pub enum PolyType {
    Subject = 0,
    Clip = 1,
}

#[repr(u8)]
pub enum ClipType {
    Intersection = 0,
    Union = 1,
    Difference = 2,
}

#[repr(u8)]
pub enum Direction {
    Left = 0,
    Right = 1,
}