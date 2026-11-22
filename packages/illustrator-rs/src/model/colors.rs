use serde::{Deserialize, Serialize};

use super::geometry::Matrix;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct SpotColor {
    pub name: String,
    pub cyan: f64,
    pub magenta: f64,
    pub yellow: f64,
    pub black: f64,
    pub tint: f64,
}

impl SpotColor {
    pub fn to_rgb(&self) -> (u8, u8, u8) {
        let c = self.cyan * self.tint;
        let m = self.magenta * self.tint;
        let y = self.yellow * self.tint;
        let k = self.black * self.tint;
        let r = (255.0 * (1.0 - c) * (1.0 - k)).round() as i32;
        let g = (255.0 * (1.0 - m) * (1.0 - k)).round() as i32;
        let b = (255.0 * (1.0 - y) * (1.0 - k)).round() as i32;
        (
            r.clamp(0, 255) as u8,
            g.clamp(0, 255) as u8,
            b.clamp(0, 255) as u8,
        )
    }

    pub fn to_hex(&self) -> String {
        let (r, g, b) = self.to_rgb();
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CmykColor {
    pub cyan: f64,
    pub magenta: f64,
    pub yellow: f64,
    pub black: f64,
}

impl CmykColor {
    pub fn to_rgb(&self) -> (u8, u8, u8) {
        let r = (255.0 * (1.0 - self.cyan) * (1.0 - self.black)).round() as i32;
        let g = (255.0 * (1.0 - self.magenta) * (1.0 - self.black)).round() as i32;
        let b = (255.0 * (1.0 - self.yellow) * (1.0 - self.black)).round() as i32;
        (
            r.clamp(0, 255) as u8,
            g.clamp(0, 255) as u8,
            b.clamp(0, 255) as u8,
        )
    }

    pub fn to_hex(&self) -> String {
        let (r, g, b) = self.to_rgb();
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    }

    pub fn from_rgb(r: f64, g: f64, b: f64) -> CmykColor {
        let k = 1.0 - r.max(g).max(b);
        if k >= 1.0 {
            return CmykColor {
                cyan: 0.0,
                magenta: 0.0,
                yellow: 0.0,
                black: 1.0,
            };
        }
        let c = (1.0 - r - k) / (1.0 - k);
        let m = (1.0 - g - k) / (1.0 - k);
        let y = (1.0 - b - k) / (1.0 - k);
        CmykColor {
            cyan: c.clamp(0.0, 1.0),
            magenta: m.clamp(0.0, 1.0),
            yellow: y.clamp(0.0, 1.0),
            black: k.clamp(0.0, 1.0),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RgbColor {
    pub red: f64,
    pub green: f64,
    pub blue: f64,
}

impl RgbColor {
    pub fn to_rgb(&self) -> (u8, u8, u8) {
        (
            (self.red * 255.0).round().clamp(0.0, 255.0) as u8,
            (self.green * 255.0).round().clamp(0.0, 255.0) as u8,
            (self.blue * 255.0).round().clamp(0.0, 255.0) as u8,
        )
    }

    pub fn to_hex(&self) -> String {
        let (r, g, b) = self.to_rgb();
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    }

    pub fn to_cmyk(&self) -> CmykColor {
        CmykColor::from_rgb(self.red, self.green, self.blue)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GrayColor {
    pub gray: f64,
}

impl GrayColor {
    pub fn to_rgb(&self) -> (u8, u8, u8) {
        let v = (self.gray * 255.0).round().clamp(0.0, 255.0) as u8;
        (v, v, v)
    }

    pub fn to_hex(&self) -> String {
        let (r, g, b) = self.to_rgb();
        format!("#{:02x}{:02x}{:02x}", r, g, b)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GradientStop {
    pub offset: f64,
    pub color: Box<Color>,
    pub midpoint: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct GradientColor {
    pub name: String,
    pub gradient_type: u8,
    pub stops: Vec<GradientStop>,
    pub transform: Matrix,
    pub origin: (f64, f64),
    pub angle: f64,
    pub length: f64,
    pub hilite_angle: f64,
    pub hilite_length: f64,
}

impl GradientColor {
    pub fn to_hex(&self) -> String {
        if let Some(stop) = self.stops.first() {
            return stop.color.to_hex();
        }
        "#000000".to_string()
    }

    pub fn to_rgb(&self) -> (u8, u8, u8) {
        if let Some(stop) = self.stops.first() {
            return stop.color.to_rgb();
        }
        (0, 0, 0)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum Color {
    Spot(SpotColor),
    Cmyk(CmykColor),
    Rgb(RgbColor),
    Gray(GrayColor),
    Gradient(GradientColor),
}

impl Color {
    pub fn to_rgb(&self) -> (u8, u8, u8) {
        match self {
            Color::Spot(c) => c.to_rgb(),
            Color::Cmyk(c) => c.to_rgb(),
            Color::Rgb(c) => c.to_rgb(),
            Color::Gray(c) => c.to_rgb(),
            Color::Gradient(c) => c.to_rgb(),
        }
    }

    pub fn to_hex(&self) -> String {
        match self {
            Color::Spot(c) => c.to_hex(),
            Color::Cmyk(c) => c.to_hex(),
            Color::Rgb(c) => c.to_hex(),
            Color::Gray(c) => c.to_hex(),
            Color::Gradient(c) => c.to_hex(),
        }
    }
}
