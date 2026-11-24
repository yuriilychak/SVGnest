use serde::{Deserialize, Serialize};

use super::colors::Color;
use super::geometry::{BoundingBox, Matrix, PathSegment, Point};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AiPath {
    pub segments: Vec<PathSegment>,
    pub fill: Option<Color>,
    pub stroke: Option<Color>,
    pub stroke_width: f64,
    pub line_cap: u8,
    pub line_join: u8,
    pub miter_limit: f64,
    pub dash: Option<(Vec<f64>, f64)>,
    pub closed: bool,
    pub name: Option<String>,
    pub opacity: f64,
    pub clip: bool,
}

impl AiPath {
    pub fn bounding_box(&self) -> Option<BoundingBox> {
        let points: Vec<Point> = self.segments.iter().flat_map(|s| s.points.clone()).collect();
        BoundingBox::from_points(&points)
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AiGroup {
    pub children: Vec<AiObject>,
    pub name: Option<String>,
    pub clipped: bool,
    pub opacity: f64,
}

impl AiGroup {
    pub fn bounding_box(&self) -> Option<BoundingBox> {
        let mut bbox: Option<BoundingBox> = None;
        for child in &self.children {
            if let Some(child_bbox) = child.bounding_box() {
                bbox = match bbox {
                    Some(b) => Some(b.union(&child_bbox)),
                    None => Some(child_bbox),
                };
            }
        }
        bbox
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AiCompoundPath {
    pub subpaths: Vec<AiPath>,
    pub fill: Option<Color>,
    pub stroke: Option<Color>,
    pub stroke_width: f64,
    pub name: Option<String>,
}

impl AiCompoundPath {
    pub fn bounding_box(&self) -> Option<BoundingBox> {
        let mut bbox: Option<BoundingBox> = None;
        for path in &self.subpaths {
            if let Some(child_bbox) = path.bounding_box() {
                bbox = match bbox {
                    Some(b) => Some(b.union(&child_bbox)),
                    None => Some(child_bbox),
                };
            }
        }
        bbox
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AiText {
    pub content: String,
    pub font: String,
    pub size: f64,
    pub transform: Matrix,
    pub fill: Option<Color>,
    pub stroke: Option<Color>,
    pub text_type: u8,
    pub name: Option<String>,
}

impl AiText {
    pub fn bounding_box(&self) -> Option<BoundingBox> {
        if self.content.is_empty() {
            return None;
        }
        let p = Point {
            x: self.transform.e,
            y: self.transform.f,
        };
        let size = self.size.max(0.001);
        let approx_width = self.content.len() as f64 * size * 0.6;
        Some(BoundingBox {
            x: p.x,
            y: p.y - size,
            width: approx_width,
            height: size * 1.2,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AiImage {
    pub width: u32,
    pub height: u32,
    pub bits_per_component: u8,
    pub color_space: String,
    pub data: Vec<u8>,
    pub transform: Matrix,
    pub name: Option<String>,
}

impl AiImage {
    pub fn bounding_box(&self) -> Option<BoundingBox> {
        if self.width == 0 || self.height == 0 {
            return None;
        }
        Some(BoundingBox {
            x: self.transform.e,
            y: self.transform.f,
            width: (self.width as f64 * self.transform.a).abs(),
            height: (self.height as f64 * self.transform.d).abs(),
        })
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum AiObject {
    Path(AiPath),
    Group(AiGroup),
    CompoundPath(AiCompoundPath),
    Text(AiText),
    Image(AiImage),
}

impl AiObject {
    pub fn bounding_box(&self) -> Option<BoundingBox> {
        match self {
            AiObject::Path(p) => p.bounding_box(),
            AiObject::Group(g) => g.bounding_box(),
            AiObject::CompoundPath(c) => c.bounding_box(),
            AiObject::Text(t) => t.bounding_box(),
            AiObject::Image(i) => i.bounding_box(),
        }
    }
}
