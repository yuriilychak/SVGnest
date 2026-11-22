use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use super::colors::{Color, SpotColor};
use super::geometry::BoundingBox;
use super::objects::AiObject;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct AiLayer {
    pub name: String,
    pub visible: bool,
    pub locked: bool,
    pub printable: bool,
    pub children: Vec<AiObject>,
    pub color: (u8, u8, u8),
}

impl AiLayer {
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
pub struct AiDocument {
    pub layers: Vec<AiLayer>,
    pub version: String,
    pub bounding_box: Option<BoundingBox>,
    pub color_mode: String,
    pub fonts_used: Vec<String>,
    pub spot_colors: Vec<SpotColor>,
    pub metadata: HashMap<String, String>,
    pub title: String,
    pub creator: String,
}

impl AiDocument {
    pub fn all_objects(&self) -> Vec<&AiObject> {
        let mut objects = Vec::new();
        for layer in &self.layers {
            for child in &layer.children {
                objects.push(child);
            }
        }
        objects
    }

    pub fn collect_colors(&self) -> Vec<Color> {
        let mut colors = Vec::new();
        let mut seen = HashSet::new();

        fn collect_color_opt(color_opt: &Option<Color>, colors: &mut Vec<Color>, seen: &mut HashSet<String>) {
            if let Some(color) = color_opt {
                let key = format!("{:?}", color);
                if seen.insert(key) {
                    colors.push(color.clone());
                }
            }
        }

        fn collect_from(obj: &AiObject, colors: &mut Vec<Color>, seen: &mut HashSet<String>) {
            match obj {
                AiObject::Path(p) => {
                    collect_color_opt(&p.fill, colors, seen);
                    collect_color_opt(&p.stroke, colors, seen);
                }
                AiObject::Group(g) => {
                    for child in &g.children {
                        collect_from(child, colors, seen);
                    }
                }
                AiObject::CompoundPath(c) => {
                    collect_color_opt(&c.fill, colors, seen);
                    collect_color_opt(&c.stroke, colors, seen);
                    for subpath in &c.subpaths {
                        collect_color_opt(&subpath.fill, colors, seen);
                        collect_color_opt(&subpath.stroke, colors, seen);
                    }
                }
                AiObject::Text(t) => {
                    collect_color_opt(&t.fill, colors, seen);
                    collect_color_opt(&t.stroke, colors, seen);
                }
                AiObject::Image(_) => {}
            }
        }

        for layer in &self.layers {
            for obj in &layer.children {
                collect_from(obj, &mut colors, &mut seen);
            }
        }
        colors
    }
}
