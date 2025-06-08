pub trait Round {
    fn rounded(self) -> Self;
}

pub trait ClipperRound {
    fn clipper_rounded(self) -> Self;
}

impl Round for f64 {
    fn rounded(self) -> Self {
        self.round()
    }
}

impl Round for f32 {
    fn rounded(self) -> Self {
        self.round()
    }
}

impl Round for i32 {
    fn rounded(self) -> Self {
        self
    }
}

impl ClipperRound for f64 {
    fn clipper_rounded(self) -> Self {
        if self < 0.0 {
            (self - 0.5).ceil()
        } else {
            (self + 0.5).floor()
        }
    }
}

impl ClipperRound for f32 {
    fn clipper_rounded(self) -> Self {
        if self < 0.0 {
            (self - 0.5).ceil()
        } else {
            (self + 0.5).floor()
        }
    }
}

impl ClipperRound for i32 {
    fn clipper_rounded(self) -> Self {
        self
    }
}