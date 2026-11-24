use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::model::*;
use crate::parser::{container::extract_pgf, lexer::tokenize, ai_parser::parse_ai};
use crate::export::svg::export_svg;
use crate::export::json::export_json;
use crate::export::metadata::{extract_metadata, AiMetadata};
use crate::writer::pgf::write_pgf;
use crate::writer::container::build_ai;

#[derive(Debug, Clone)]
pub enum PathSegment {
    Index { name: &'static str, index: usize },
    Name { name: String },
}

#[derive(Debug, Clone)]
pub struct NodePath(pub Vec<PathSegment>);

#[derive(Debug, Clone)]
pub enum NodeValue {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    String(String),
    Color(Color),
    Object(AiObject),
    Layer(AiLayer),
    Document(AiDocument),
    Array(Vec<NodeValue>),
    Map(std::collections::HashMap<String, NodeValue>),
}

#[derive(Debug, Clone)]
pub struct DocumentNode {
    pub path: NodePath,
    pub value: NodeValue,
    pub children: Vec<DocumentNode>,
}

pub struct AiHandler {
    document: AiDocument,
    metadata: Option<AiMetadata>,
    #[allow(dead_code)]
    pgf_source: Option<String>,
    path: PathBuf,
}

impl AiHandler {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let pgf = extract_pgf(&path)?;
        let tokens = tokenize(&pgf)?;
        let document = parse_ai(tokens)?;
        let metadata = extract_metadata(&document, &pgf);
        Ok(AiHandler {
            document,
            metadata: Some(metadata),
            pgf_source: Some(pgf),
            path,
        })
    }

    pub fn save(&mut self, path: impl Into<PathBuf>) -> Result<()> {
        let path: PathBuf = path.into();
        let pgf = write_pgf(&self.document, self.metadata.as_ref())?;
        build_ai(pgf, &path, Some(&self.path), self.metadata.clone())?;
        Ok(())
    }

    pub fn create(path: impl Into<PathBuf>, _template: Option<&Path>) -> Result<Self> {
        let path = path.into();
        let document = AiDocument {
            layers: vec![AiLayer {
                name: "Layer 1".into(),
                ..Default::default()
            }],
            version: "AI 14.0".into(),
            color_mode: "CMYK".into(),
            bounding_box: Some(BoundingBox {
                x: 0.0,
                y: 0.0,
                width: 612.0,
                height: 792.0,
            }),
            ..Default::default()
        };
        Ok(AiHandler {
            document,
            metadata: None,
            pgf_source: None,
            path,
        })
    }

    pub fn view_text(&self) -> String {
        let mut out = String::new();
        out.push_str(&format!("Title: {}\n", self.document.title));
        out.push_str(&format!("Version: {}\n", self.document.version));
        out.push_str(&format!("Color Mode: {}\n", self.document.color_mode));
        if let Some(bb) = &self.document.bounding_box {
            out.push_str(&format!(
                "Dimensions: {} x {} pt\n",
                bb.width, bb.height
            ));
        }
        out.push_str(&format!("Layers: {}\n", self.document.layers.len()));
        for (i, layer) in self.document.layers.iter().enumerate() {
            out.push_str(&format!(
                "  {}. {} ({} objects)\n",
                i + 1,
                layer.name,
                layer.children.len()
            ));
        }
        if !self.document.spot_colors.is_empty() {
            out.push_str("Spot Colors:\n");
            for sc in &self.document.spot_colors {
                out.push_str(&format!("  - {}: {}\n", sc.name, sc.to_hex()));
            }
        }
        if !self.document.fonts_used.is_empty() {
            out.push_str(&format!("Fonts: {}\n", self.document.fonts_used.join(", ")));
        }
        out
    }

    pub fn view_svg(&self) -> Result<String> {
        export_svg(&self.document)
    }

    pub fn view_json(&self) -> Result<String> {
        export_json(&self.document)
    }

    pub fn view_outline(&self) -> String {
        let mut out = String::new();
        for (i, layer) in self.document.layers.iter().enumerate() {
            out.push_str(&format!("/page[1]/layer[{}] \"{}\"\n", i + 1, layer.name));
            self.write_objects_outline(&layer.children, 2, &mut out);
        }
        out
    }

    fn write_objects_outline(&self, objects: &[AiObject], depth: usize, out: &mut String) {
        let indent = "  ".repeat(depth);
        for obj in objects {
            match obj {
                AiObject::Path(p) => {
                    let name = p.name.as_deref().unwrap_or("path");
                    out.push_str(&format!(
                        "{}{} [{} segs, {}] {}",
                        indent,
                        self.object_type_name(obj),
                        p.segments.len(),
                        p.closed.then_some("closed").unwrap_or("open"),
                        name,
                    ));
                    out.push('\n');
                }
                AiObject::Group(g) => {
                    let name = g.name.as_deref().unwrap_or("group");
                    out.push_str(&format!("{}{} \"{}\"\n", indent, self.object_type_name(obj), name));
                    self.write_objects_outline(&g.children, depth + 1, out);
                }
                AiObject::CompoundPath(c) => {
                    let name = c.name.as_deref().unwrap_or("compound");
                    out.push_str(&format!(
                        "{}{} ({} subpaths) {}",
                        indent,
                        self.object_type_name(obj),
                        c.subpaths.len(),
                        name,
                    ));
                    out.push('\n');
                }
                AiObject::Text(t) => {
                    let name = t.name.as_deref().unwrap_or("text");
                    out.push_str(&format!(
                        "{}{} \"{}\" \"{}\"",
                        indent,
                        self.object_type_name(obj),
                        t.content,
                        name,
                    ));
                    out.push('\n');
                }
                AiObject::Image(img) => {
                    let name = img.name.as_deref().unwrap_or("image");
                    out.push_str(&format!(
                        "{}{} {}x{} {}",
                        indent,
                        self.object_type_name(obj),
                        img.width,
                        img.height,
                        name,
                    ));
                    out.push('\n');
                }
            }
        }
    }

    fn object_type_name(&self, obj: &AiObject) -> &'static str {
        match obj {
            AiObject::Path(_) => "path",
            AiObject::Group(_) => "group",
            AiObject::CompoundPath(_) => "compound",
            AiObject::Text(_) => "text",
            AiObject::Image(_) => "image",
        }
    }

    pub fn stats(&self) -> String {
        let mut out = String::new();
        let total_objects = self
            .document
            .layers
            .iter()
            .map(|l| l.children.len())
            .sum::<usize>();
        out.push_str(&format!("Layers: {}\n", self.document.layers.len()));
        out.push_str(&format!("Objects: {total_objects}\n"));
        out.push_str(&format!(
            "Spot colors: {}\n",
            self.document.spot_colors.len()
        ));
        out.push_str(&format!("Fonts: {}\n", self.document.fonts_used.len()));
        out
    }

    pub fn issues(&self) -> Vec<String> {
        let mut issues = Vec::new();
        if self.document.layers.is_empty() {
            issues.push("No layers found".to_string());
        }
        for (i, layer) in self.document.layers.iter().enumerate() {
            if layer.children.is_empty() {
                issues.push(format!("Layer {} '{}' is empty", i + 1, layer.name));
            }
        }
        issues
    }

    pub fn extract_text_with_offsets(&self) -> Vec<(String, f64, f64)> {
        let mut result = Vec::new();
        for layer in &self.document.layers {
            Self::collect_text(&layer.children, &mut result);
        }
        result
    }

    fn collect_text(objects: &[AiObject], out: &mut Vec<(String, f64, f64)>) {
        for obj in objects {
            match obj {
                AiObject::Text(t) => {
                    out.push((t.content.clone(), t.transform.e, t.transform.f));
                }
                AiObject::Group(g) => Self::collect_text(&g.children, out),
                _ => {}
            }
        }
    }

    /// Resolve a path like `/page[1]/layer[2]/path[3]` to a mutable reference
    pub fn get_mut(&mut self, path_str: &str) -> Result<&mut AiObject> {
        let segments = Self::parse_path(path_str)?;
        if segments.is_empty() {
            return Err(Error::Parse("Empty path".to_string()));
        }
        let (name, _idx) = &segments[0];
        if name == "page" {
            if segments.len() < 2 {
                return Err(Error::Parse("Path must include layer".to_string()));
            }
            let (_lname, lidx) = &segments[1];
            let layer = self
                .document
                .layers
                .get_mut(*lidx)
                .ok_or_else(|| Error::Parse(format!("Layer index {lidx} out of bounds")))?;
            if segments.len() == 2 {
                return Err(Error::Parse("Path must include object type".to_string()));
            }
            Self::resolve_object_mut(&segments[2..], &mut layer.children)
        } else {
            Err(Error::Parse(format!("Unknown path segment '{name}'")))
        }
    }

    fn parse_path(path_str: &str) -> Result<Vec<(String, usize)>> {
        let mut segments = Vec::new();
        for part in path_str.split('/').filter(|s| !s.is_empty()) {
            if let Some((name, idx)) = part.split_once('[') {
                let idx = idx
                    .trim_end_matches(']')
                    .parse::<usize>()
                    .map_err(|_| Error::Parse(format!("Invalid path index in {part}")))?;
                segments.push((name.to_string(), idx.saturating_sub(1)));
            } else {
                segments.push((part.to_string(), 0));
            }
        }
        Ok(segments)
    }

    fn resolve_object_mut<'a>(
        segments: &[(String, usize)],
        objects: &'a mut Vec<AiObject>,
    ) -> Result<&'a mut AiObject> {
        let (name, idx) = &segments[0];
        let obj = objects
            .get_mut(*idx)
            .ok_or_else(|| Error::Parse(format!("Object index {idx} out of bounds")))?;

        if segments.len() == 1 {
            // Verify the type matches
            let type_ok = match name.as_str() {
                "path" => matches!(obj, AiObject::Path(_)),
                "group" => matches!(obj, AiObject::Group(_)),
                "compound" => matches!(obj, AiObject::CompoundPath(_)),
                "text" => matches!(obj, AiObject::Text(_)),
                "image" => matches!(obj, AiObject::Image(_)),
                _ => false,
            };
            if !type_ok {
                return Err(Error::Parse(format!(
                    "Expected '{name}' but found different object type"
                )));
            }
            Ok(obj)
        } else {
            match obj {
                AiObject::Group(g) => Self::resolve_object_mut(&segments[1..], &mut g.children),
                _ => Err(Error::Parse(
                    "Only groups can have nested children".to_string(),
                )),
            }
        }
    }
}

impl Default for AiLayer {
    fn default() -> Self {
        AiLayer {
            name: "Layer 1".into(),
            visible: true,
            locked: false,
            printable: true,
            children: Vec::new(),
            color: (79, 128, 255),
        }
    }
}

impl Default for AiDocument {
    fn default() -> Self {
        AiDocument {
            layers: Vec::new(),
            version: String::new(),
            bounding_box: None,
            color_mode: "CMYK".into(),
            fonts_used: Vec::new(),
            spot_colors: Vec::new(),
            metadata: std::collections::HashMap::new(),
            title: String::new(),
            creator: String::new(),
        }
    }
}
