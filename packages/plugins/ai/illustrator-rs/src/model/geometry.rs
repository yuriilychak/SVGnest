use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum SegmentType {
    Moveto,
    Lineto,
    Curveto,
    Closepath,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

impl Point {
    pub fn transformed(&self, matrix: &Matrix) -> Point {
        let x = matrix.a * self.x + matrix.c * self.y + matrix.e;
        let y = matrix.b * self.x + matrix.d * self.y + matrix.f;
        Point { x, y }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PathSegment {
    pub seg_type: SegmentType,
    pub points: Vec<Point>,
    pub smooth: bool,
}

impl PathSegment {
    pub fn svg_command(&self) -> String {
        match self.seg_type {
            SegmentType::Moveto => {
                if self.points.is_empty() {
                    return String::new();
                }
                format!("M {},{}", self.points[0].x, self.points[0].y)
            }
            SegmentType::Lineto => {
                if self.points.is_empty() {
                    return String::new();
                }
                format!("L {},{}", self.points[0].x, self.points[0].y)
            }
            SegmentType::Curveto => {
                if self.points.len() < 3 {
                    return String::new();
                }
                format!(
                    "C {},{},{},{},{},{}",
                    self.points[0].x, self.points[0].y,
                    self.points[1].x, self.points[1].y,
                    self.points[2].x, self.points[2].y
                )
            }
            SegmentType::Closepath => "Z".to_string(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl BoundingBox {
    pub fn from_points(points: &[Point]) -> Option<BoundingBox> {
        if points.is_empty() {
            return None;
        }
        let mut min_x = points[0].x;
        let mut max_x = points[0].x;
        let mut min_y = points[0].y;
        let mut max_y = points[0].y;
        for p in points.iter().skip(1) {
            if p.x < min_x {
                min_x = p.x;
            }
            if p.x > max_x {
                max_x = p.x;
            }
            if p.y < min_y {
                min_y = p.y;
            }
            if p.y > max_y {
                max_y = p.y;
            }
        }
        Some(BoundingBox {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        })
    }

    pub fn union(&self, other: &BoundingBox) -> BoundingBox {
        let x = self.x.min(other.x);
        let y = self.y.min(other.y);
        let right = (self.x + self.width).max(other.x + other.width);
        let bottom = (self.y + self.height).max(other.y + other.height);
        BoundingBox {
            x,
            y,
            width: right - x,
            height: bottom - y,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Matrix {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub e: f64,
    pub f: f64,
}

impl Matrix {
    pub fn identity() -> Matrix {
        Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: 0.0,
            f: 0.0,
        }
    }

    pub fn translate(tx: f64, ty: f64) -> Matrix {
        Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            e: tx,
            f: ty,
        }
    }

    pub fn scale(sx: f64, sy: f64) -> Matrix {
        Matrix {
            a: sx,
            b: 0.0,
            c: 0.0,
            d: sy,
            e: 0.0,
            f: 0.0,
        }
    }

    pub fn rotate(angle_degrees: f64) -> Matrix {
        let r = angle_degrees.to_radians();
        let cos_r = r.cos();
        let sin_r = r.sin();
        Matrix {
            a: cos_r,
            b: sin_r,
            c: -sin_r,
            d: cos_r,
            e: 0.0,
            f: 0.0,
        }
    }

    pub fn concat(&self, other: &Matrix) -> Matrix {
        Matrix {
            a: self.a * other.a + self.c * other.b,
            b: self.b * other.a + self.d * other.b,
            c: self.a * other.c + self.c * other.d,
            d: self.b * other.c + self.d * other.d,
            e: self.a * other.e + self.c * other.f + self.e,
            f: self.b * other.e + self.d * other.f + self.f,
        }
    }

    pub fn svg_transform(&self) -> String {
        format!(
            "matrix({},{},{},{},{},{})",
            self.a, self.b, self.c, self.d, self.e, self.f
        )
    }

    pub fn from_svg_transform(s: &str) -> Matrix {
        let mut result = Matrix::identity();
        let chars: Vec<char> = s.chars().collect();
        let len = chars.len();
        let mut i = 0;

        while i < len {
            while i < len && chars[i].is_whitespace() {
                i += 1;
            }
            let func_start = i;
            while i < len && chars[i].is_alphabetic() {
                i += 1;
            }
            let func: String = chars[func_start..i].iter().collect();
            if func.is_empty() {
                break;
            }
            while i < len && chars[i].is_whitespace() {
                i += 1;
            }
            if i >= len || chars[i] != '(' {
                break;
            }
            i += 1;
            let args_start = i;
            while i < len && chars[i] != ')' {
                i += 1;
            }
            let args_str: String = chars[args_start..i].iter().collect();
            if i < len {
                i += 1;
            }
            let args: Vec<f64> = args_str
                .split(|c: char| c == ',' || c.is_whitespace())
                .filter(|s| !s.is_empty())
                .filter_map(|s| s.parse::<f64>().ok())
                .collect();

            match func.as_str() {
                "matrix" if args.len() == 6 => {
                    let m = Matrix {
                        a: args[0],
                        b: args[1],
                        c: args[2],
                        d: args[3],
                        e: args[4],
                        f: args[5],
                    };
                    result = result.concat(&m);
                }
                "translate" if !args.is_empty() => {
                    let tx = args[0];
                    let ty = args.get(1).copied().unwrap_or(0.0);
                    let m = Matrix::translate(tx, ty);
                    result = result.concat(&m);
                }
                "scale" if !args.is_empty() => {
                    let sx = args[0];
                    let sy = args.get(1).copied().unwrap_or(sx);
                    let m = Matrix::scale(sx, sy);
                    result = result.concat(&m);
                }
                "rotate" if !args.is_empty() => {
                    let angle = args[0];
                    let r = angle.to_radians();
                    let cos_r = r.cos();
                    let sin_r = r.sin();
                    if args.len() == 3 {
                        let cx = args[1];
                        let cy = args[2];
                        let t1 = Matrix::translate(cx, cy);
                        let rot = Matrix {
                            a: cos_r,
                            b: sin_r,
                            c: -sin_r,
                            d: cos_r,
                            e: 0.0,
                            f: 0.0,
                        };
                        let t2 = Matrix::translate(-cx, -cy);
                        let m = t1.concat(&rot).concat(&t2);
                        result = result.concat(&m);
                    } else {
                        let m = Matrix {
                            a: cos_r,
                            b: sin_r,
                            c: -sin_r,
                            d: cos_r,
                            e: 0.0,
                            f: 0.0,
                        };
                        result = result.concat(&m);
                    }
                }
                _ => {}
            }
        }
        result
    }

    pub fn is_identity(&self) -> bool {
        self.a == 1.0
            && self.b == 0.0
            && self.c == 0.0
            && self.d == 1.0
            && self.e == 0.0
            && self.f == 0.0
    }
}
