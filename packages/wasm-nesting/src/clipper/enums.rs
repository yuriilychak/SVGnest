#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PolyFillType {
    NonZero = 1,
    Positive = 2,
    Negative = 3,
}

#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum PolyType {
    Subject = 0,
    Clip = 1,
}

#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum ClipType {
    Union = 1,
    Difference = 2,
}

#[repr(u8)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Direction {
    Left = 0,
    Right = 1,
}
