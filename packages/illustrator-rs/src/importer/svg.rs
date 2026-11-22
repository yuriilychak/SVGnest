use std::collections::HashMap;
use std::sync::LazyLock;

use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::error::{Error, Result};
use crate::export::metadata::AiMetadata;
use crate::model::*;

use super::path::parse_svg_path;

const MAX_SVG_DEPTH: usize = 200;
const MAX_EMBEDDED_IMAGE_BYTES: u64 = 50 * 1024 * 1024;

#[derive(Debug)]
struct SvgElement {
    name: String,
    attrs: HashMap<String, String>,
    children: Vec<SvgElement>,
    text: String,
}

struct SvgImporter {
    metadata: Option<AiMetadata>,
    gradient_defs: HashMap<String, GradientColor>,
    clip_defs: HashMap<String, Vec<PathSegment>>,
    bbox: Option<BoundingBox>,
}

pub fn import_svg(svg_path: &std::path::Path) -> Result<AiDocument> {
    let svg_string = std::fs::read_to_string(svg_path)?;
    let meta_path = svg_path.with_extension("ai-meta.json");
    let alt_path = svg_path
        .parent()
        .unwrap_or(std::path::Path::new(""))
        .join(format!(
            "{}.ai-meta.json",
            svg_path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
        ));
    let metadata = if meta_path.exists() {
        Some(crate::export::metadata::load_metadata(&meta_path)?)
    } else if alt_path.exists() {
        Some(crate::export::metadata::load_metadata(&alt_path)?)
    } else {
        None
    };
    import_svg_string(&svg_string, metadata)
}

pub fn import_svg_string(svg_string: &str, metadata: Option<AiMetadata>) -> Result<AiDocument> {
    let root = build_svg_tree(svg_string)?;
    let mut importer = SvgImporter {
        metadata,
        gradient_defs: HashMap::new(),
        clip_defs: HashMap::new(),
        bbox: None,
    };
    Ok(importer.parse_svg(&root))
}

fn build_svg_tree(xml: &str) -> Result<SvgElement> {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();
    let mut stack: Vec<SvgElement> = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let attrs = parse_attributes(e);
                stack.push(SvgElement {
                    name,
                    attrs,
                    children: vec![],
                    text: String::new(),
                });
            }
            Ok(Event::Empty(ref e)) => {
                let name = String::from_utf8_lossy(e.name().as_ref()).to_string();
                let attrs = parse_attributes(e);
                let el = SvgElement {
                    name,
                    attrs,
                    children: vec![],
                    text: String::new(),
                };
                if let Some(parent) = stack.last_mut() {
                    parent.children.push(el);
                }
            }
            Ok(Event::End(ref _e)) => {
                if let Some(el) = stack.pop() {
                    if let Some(parent) = stack.last_mut() {
                        parent.children.push(el);
                    } else {
                        return Ok(el);
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                if let Ok(text) = e.unescape()
                    && let Some(parent) = stack.last_mut() {
                        parent.text.push_str(&text);
                    }
            }
            Ok(Event::CData(ref e)) => {
                let text = String::from_utf8_lossy(e.as_ref());
                if let Some(parent) = stack.last_mut() {
                    parent.text.push_str(&text);
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Error::Import(format!("XML parse error: {}", e))),
            _ => {}
        }
        buf.clear();
    }

    Err(Error::Import("No root element found".to_string()))
}

fn parse_attributes(e: &quick_xml::events::BytesStart) -> HashMap<String, String> {
    let mut attrs = HashMap::new();
    for attr in e.attributes().flatten() {
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let value = String::from_utf8_lossy(attr.value.as_ref()).to_string();
        attrs.insert(key, value);
    }
    attrs
}

impl SvgImporter {
    fn parse_svg(&mut self, root: &SvgElement) -> AiDocument {
        if let Some(vb) = root.attrs.get("viewBox") {
            let parts: Vec<f64> = vb
                .split_whitespace()
                .filter_map(|s| s.parse::<f64>().ok())
                .collect();
            if parts.len() == 4 {
                self.bbox = Some(BoundingBox {
                    x: parts[0],
                    y: parts[1],
                    width: parts[2],
                    height: parts[3],
                });
            }
        }

        if self.bbox.is_none() {
            let w = root
                .attrs
                .get("width")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(612.0);
            let h = root
                .attrs
                .get("height")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(792.0);
            self.bbox = Some(BoundingBox {
                x: 0.0,
                y: 0.0,
                width: w,
                height: h,
            });
        }

        for defs_el in find_descendants(root, "defs") {
            self.parse_defs(defs_el);
        }

        let content_root = self.find_content_root(root);

        let mut doc = AiDocument {
            layers: vec![],
            version: self
                .metadata
                .as_ref()
                .map(|m| m.version.clone())
                .unwrap_or_else(|| "SVG-Imported".to_string()),
            bounding_box: self.bbox.clone(),
            color_mode: self
                .metadata
                .as_ref()
                .map(|m| m.color_mode.clone())
                .unwrap_or_else(|| "RGB".to_string()),
            fonts_used: self
                .metadata
                .as_ref()
                .map(|m| m.fonts_used.clone())
                .unwrap_or_default(),
            spot_colors: vec![],
            metadata: self
                .metadata
                .as_ref()
                .map(|m| m.metadata.clone())
                .unwrap_or_default(),
            title: self
                .metadata
                .as_ref()
                .map(|m| m.title.clone())
                .unwrap_or_default(),
            creator: self
                .metadata
                .as_ref()
                .map(|m| m.creator.clone())
                .unwrap_or_default(),
        };

        let mut has_layers = false;
        let mut loose_elements: Vec<&SvgElement> = vec![];

        for child in &content_root.children {
            if child.name == "g" && child.attrs.contains_key("id") {
                let layer = self.parse_layer(child);
                if !layer.children.is_empty() {
                    doc.layers.push(layer);
                    has_layers = true;
                }
            } else if child.name != "defs" {
                loose_elements.push(child);
            }
        }

        if has_layers && !loose_elements.is_empty()
            && let Some(target) = doc.layers.last_mut() {
                for child in loose_elements {
                    if let Some(obj) = self.parse_element(child, 0) {
                        target.children.push(obj);
                    }
                }
            }

        if !has_layers {
            let mut default_layer = AiLayer {
                name: "Layer 1".to_string(),
                visible: true,
                locked: false,
                printable: true,
                children: vec![],
                color: (0, 0, 0),
            };
            for child in &content_root.children {
                if child.name == "defs" {
                    continue;
                }
                if let Some(obj) = self.parse_element(child, 0) {
                    default_layer.children.push(obj);
                }
            }
            if !default_layer.children.is_empty() {
                doc.layers.push(default_layer);
            }
        }

        self.collect_used_spot_colors(&mut doc);

        doc
    }

    fn find_content_root<'a>(&self, root: &'a SvgElement) -> &'a SvgElement {
        for child in &root.children {
            if child.name == "g"
                && let Some(transform) = child.attrs.get("transform")
                    && (transform.contains("scale(1,-1)") || transform.contains("scale(1, -1)")) {
                        return child;
                    }
        }
        root
    }

    fn parse_defs(&mut self, defs_el: &SvgElement) {
        for child in &defs_el.children {
            match child.name.as_str() {
                "linearGradient" => self.parse_gradient_def(child, 0),
                "radialGradient" => self.parse_gradient_def(child, 1),
                "clipPath" => self.parse_clip_def(child),
                _ => {}
            }
        }
    }

    fn parse_gradient_def(&mut self, el: &SvgElement, gradient_type: u8) {
        let grad_id = match el.attrs.get("id") {
            Some(id) if !id.is_empty() => id.clone(),
            _ => return,
        };

        let transform = el
            .attrs
            .get("gradientTransform")
            .map(|s| Matrix::from_svg_transform(s))
            .unwrap_or_else(Matrix::identity);

        let mut stops: Vec<GradientStop> = vec![];
        for child in &el.children {
            if child.name == "stop" {
                let offset = child
                    .attrs
                    .get("offset")
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let stop_color_str = child
                    .attrs
                    .get("stop-color")
                    .map(|s| s.as_str())
                    .unwrap_or("#000000");
                let color = self
                    .parse_solid_color(stop_color_str)
                    .unwrap_or(Color::Rgb(RgbColor {
                        red: 0.0,
                        green: 0.0,
                        blue: 0.0,
                    }));
                stops.push(GradientStop {
                    offset,
                    color: Box::new(color),
                    midpoint: 0.5,
                });
            }
        }

        self.gradient_defs.insert(
            grad_id.clone(),
            GradientColor {
                name: grad_id,
                gradient_type,
                stops,
                transform,
                origin: (0.0, 0.0),
                angle: 0.0,
                length: 100.0,
                hilite_angle: 0.0,
                hilite_length: 0.0,
            },
        );
    }

    fn parse_clip_def(&mut self, el: &SvgElement) {
        let clip_id = match el.attrs.get("id") {
            Some(id) if !id.is_empty() => id.clone(),
            _ => return,
        };

        for child in &el.children {
            if child.name == "path"
                && let Some(d) = child.attrs.get("d")
                    && let Ok(subpaths) = parse_svg_path(d)
                        && let Some(sp) = subpaths.into_iter().next() {
                            self.clip_defs.insert(clip_id.clone(), sp);
                        }
        }
    }

    fn parse_layer(&self, g_el: &SvgElement) -> AiLayer {
        let layer_id = g_el.attrs.get("id").map(|s| s.as_str()).unwrap_or("Layer 1");
        let layer_name = layer_id.replace('-', " ");
        let visible = g_el.attrs.get("visibility").map(|s| s.as_str()) != Some("hidden");

        let mut layer = AiLayer {
            name: layer_name,
            visible,
            locked: false,
            printable: true,
            children: vec![],
            color: (0, 0, 0),
        };

        for child in &g_el.children {
            if let Some(obj) = self.parse_element(child, 0) {
                layer.children.push(obj);
            }
        }

        layer
    }

    fn parse_element(&self, el: &SvgElement, depth: usize) -> Option<AiObject> {
        if depth > MAX_SVG_DEPTH {
            return None;
        }

        match el.name.as_str() {
            "path" => self.parse_path(el),
            "g" => self.parse_group(el, depth + 1),
            "text" => self.parse_text(el),
            "image" => self.parse_image(el),
            "rect" => self.parse_rect(el),
            "circle" | "ellipse" => self.parse_ellipse(el),
            "line" => self.parse_line(el),
            "polygon" | "polyline" => {
                self.parse_polyline(el, el.name == "polygon")
            }
            _ => None,
        }
    }

    fn parse_path(&self, el: &SvgElement) -> Option<AiObject> {
        let d = el.attrs.get("d")?;
        if d.is_empty() {
            return None;
        }

        let subpaths = parse_svg_path(d).ok()?;
        if subpaths.is_empty() {
            return None;
        }

        let fill = self.parse_color(el.attrs.get("fill").map(|s| s.as_str()));
        let stroke = self.parse_color(el.attrs.get("stroke").map(|s| s.as_str()));
        let stroke_width = el
            .attrs
            .get("stroke-width")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(1.0);
        let line_cap = parse_linecap(
            el.attrs
                .get("stroke-linecap")
                .map(|s| s.as_str())
                .unwrap_or("butt"),
        );
        let line_join = parse_linejoin(
            el.attrs
                .get("stroke-linejoin")
                .map(|s| s.as_str())
                .unwrap_or("miter"),
        );
        let miter_limit = el
            .attrs
            .get("stroke-miterlimit")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(10.0);
        let dash = parse_dasharray(
            el.attrs.get("stroke-dasharray").map(|s| s.as_str()),
            el.attrs.get("stroke-dashoffset").map(|s| s.as_str()),
        );
        let fill_rule = el
            .attrs
            .get("fill-rule")
            .map(|s| s.as_str())
            .unwrap_or("");

        let fill_none = el.attrs.get("fill").map(|s| s.as_str()) == Some("none");
        let stroke_none = el.attrs.get("stroke").map(|s| s.as_str()) == Some("none");

        if subpaths.len() > 1 && fill_rule == "evenodd" {
            let paths: Vec<AiPath> = subpaths
                .into_iter()
                .map(|sp| {
                    let closed = has_closepath(&sp);
                    AiPath {
                        segments: sp,
                        fill: None,
                        stroke: None,
                        stroke_width: 1.0,
                        line_cap: 0,
                        line_join: 0,
                        miter_limit: 4.0,
                        dash: None,
                        closed,
                        name: None,
                        opacity: 1.0,
                        clip: false,
                    }
                })
                .collect();
            return Some(AiObject::CompoundPath(AiCompoundPath {
                subpaths: paths,
                fill: if fill_none { None } else { fill },
                stroke: if stroke_none { None } else { stroke },
                stroke_width,
                name: None,
            }));
        }

        let all_segments: Vec<PathSegment> = subpaths.into_iter().flatten().collect();
        let closed = has_closepath(&all_segments);

        Some(AiObject::Path(AiPath {
            segments: all_segments,
            fill: if fill_none { None } else { fill },
            stroke: if stroke_none { None } else { stroke },
            stroke_width,
            line_cap,
            line_join,
            miter_limit,
            dash,
            closed,
            name: None,
            opacity: 1.0,
            clip: false,
        }))
    }

    fn parse_group(&self, g_el: &SvgElement, depth: usize) -> Option<AiObject> {
        let mut group = AiGroup {
            children: vec![],
            name: g_el.attrs.get("id").cloned(),
            clipped: false,
            opacity: 1.0,
        };

        if let Some(clip_ref) = g_el.attrs.get("clip-path") {
            let re = regex_lite::Regex::new(r"url\(#([^)]+)\)").unwrap();
            if let Some(cap) = re.captures(clip_ref)
                && let Some(clip_id) = cap.get(1)
                    && let Some(clip_segments) = self.clip_defs.get(clip_id.as_str()) {
                        group.clipped = true;
                        group.children.push(AiObject::Path(AiPath {
                            segments: clip_segments.clone(),
                            fill: None,
                            stroke: None,
                            stroke_width: 1.0,
                            line_cap: 0,
                            line_join: 0,
                            miter_limit: 4.0,
                            dash: None,
                            closed: true,
                            name: None,
                            opacity: 1.0,
                            clip: true,
                        }));
                    }
        }

        for child in &g_el.children {
            if let Some(obj) = self.parse_element(child, depth) {
                group.children.push(obj);
            }
        }

        Some(AiObject::Group(group))
    }

    fn parse_text(&self, el: &SvgElement) -> Option<AiObject> {
        let mut content = el.text.clone();
        if content.is_empty() {
            for child in &el.children {
                if child.name == "tspan" {
                    content.push_str(&child.text);
                }
            }
        }
        if content.is_empty() {
            return None;
        }

        let font = el
            .attrs
            .get("font-family")
            .cloned()
            .unwrap_or_else(|| "Helvetica".to_string());
        let size = el
            .attrs
            .get("font-size")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(12.0);

        let transform = el
            .attrs
            .get("transform")
            .map(|s| Matrix::from_svg_transform(s))
            .unwrap_or_else(Matrix::identity);

        let fill = self.parse_color(el.attrs.get("fill").map(|s| s.as_str()));
        let stroke = self.parse_color(el.attrs.get("stroke").map(|s| s.as_str()));

        Some(AiObject::Text(AiText {
            content,
            font,
            size,
            transform,
            fill,
            stroke,
            text_type: 0,
            name: None,
        }))
    }

    fn parse_image(&self, el: &SvgElement) -> Option<AiObject> {
        let width = el
            .attrs
            .get("width")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0) as u32;
        let height = el
            .attrs
            .get("height")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0) as u32;

        let transform = if let Some(transform_str) = el.attrs.get("transform") {
            Matrix::from_svg_transform(transform_str)
        } else {
            let x = el
                .attrs
                .get("x")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let y = el
                .attrs
                .get("y")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            Matrix {
                a: 1.0,
                b: 0.0,
                c: 0.0,
                d: 1.0,
                e: x,
                f: y,
            }
        };

        let href = el
            .attrs
            .get("href")
            .or_else(|| el.attrs.get("xlink:href"))
            .map(|s| s.as_str())
            .unwrap_or("");

        let data = if href.starts_with("data:") {
            if let Some((_, encoded)) = href.split_once(',') {
                if (encoded.len() as u64) <= MAX_EMBEDDED_IMAGE_BYTES * 4 / 3 {
                    base64::engine::general_purpose::STANDARD
                        .decode(encoded)
                        .unwrap_or_default()
                } else {
                    vec![]
                }
            } else {
                vec![]
            }
        } else {
            vec![]
        };

        Some(AiObject::Image(AiImage {
            width,
            height,
            bits_per_component: 8,
            color_space: "RGB".to_string(),
            data,
            transform,
            name: None,
        }))
    }

    fn parse_rect(&self, el: &SvgElement) -> Option<AiObject> {
        let x = el
            .attrs
            .get("x")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let y = el
            .attrs
            .get("y")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let w = el
            .attrs
            .get("width")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let h = el
            .attrs
            .get("height")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);

        let segments = vec![
            PathSegment {
                seg_type: SegmentType::Moveto,
                points: vec![Point { x, y }],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Lineto,
                points: vec![Point { x: x + w, y }],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Lineto,
                points: vec![Point { x: x + w, y: y + h }],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Lineto,
                points: vec![Point { x, y: y + h }],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Closepath,
                points: vec![],
                smooth: true,
            },
        ];

        let fill = self.parse_color(el.attrs.get("fill").map(|s| s.as_str()));
        let stroke = self.parse_color(el.attrs.get("stroke").map(|s| s.as_str()));
        let fill_none = el.attrs.get("fill").map(|s| s.as_str()) == Some("none");
        let stroke_none = el.attrs.get("stroke").map(|s| s.as_str()) == Some("none");

        Some(AiObject::Path(AiPath {
            segments,
            fill: if fill_none { None } else { fill },
            stroke: if stroke_none { None } else { stroke },
            stroke_width: el
                .attrs
                .get("stroke-width")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(1.0),
            line_cap: 0,
            line_join: 0,
            miter_limit: 4.0,
            dash: None,
            closed: true,
            name: None,
            opacity: 1.0,
            clip: false,
        }))
    }

    fn parse_ellipse(&self, el: &SvgElement) -> Option<AiObject> {
        let (cx, cy, rx, ry) = if el.name == "circle" {
            let cx = el
                .attrs
                .get("cx")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let cy = el
                .attrs
                .get("cy")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let r = el
                .attrs
                .get("r")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            (cx, cy, r, r)
        } else {
            let cx = el
                .attrs
                .get("cx")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let cy = el
                .attrs
                .get("cy")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let rx = el
                .attrs
                .get("rx")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let ry = el
                .attrs
                .get("ry")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            (cx, cy, rx, ry)
        };

        let k = 0.5522847498;

        let segments = vec![
            PathSegment {
                seg_type: SegmentType::Moveto,
                points: vec![Point {
                    x: cx + rx,
                    y: cy,
                }],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Curveto,
                points: vec![
                    Point {
                        x: cx + rx,
                        y: cy + ry * k,
                    },
                    Point {
                        x: cx + rx * k,
                        y: cy + ry,
                    },
                    Point { x: cx, y: cy + ry },
                ],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Curveto,
                points: vec![
                    Point {
                        x: cx - rx * k,
                        y: cy + ry,
                    },
                    Point {
                        x: cx - rx,
                        y: cy + ry * k,
                    },
                    Point {
                        x: cx - rx,
                        y: cy,
                    },
                ],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Curveto,
                points: vec![
                    Point {
                        x: cx - rx,
                        y: cy - ry * k,
                    },
                    Point {
                        x: cx - rx * k,
                        y: cy - ry,
                    },
                    Point { x: cx, y: cy - ry },
                ],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Curveto,
                points: vec![
                    Point {
                        x: cx + rx * k,
                        y: cy - ry,
                    },
                    Point {
                        x: cx + rx,
                        y: cy - ry * k,
                    },
                    Point {
                        x: cx + rx,
                        y: cy,
                    },
                ],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Closepath,
                points: vec![],
                smooth: true,
            },
        ];

        let fill = self.parse_color(el.attrs.get("fill").map(|s| s.as_str()));
        let stroke = self.parse_color(el.attrs.get("stroke").map(|s| s.as_str()));
        let fill_none = el.attrs.get("fill").map(|s| s.as_str()) == Some("none");
        let stroke_none = el.attrs.get("stroke").map(|s| s.as_str()) == Some("none");

        Some(AiObject::Path(AiPath {
            segments,
            fill: if fill_none { None } else { fill },
            stroke: if stroke_none { None } else { stroke },
            stroke_width: el
                .attrs
                .get("stroke-width")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(1.0),
            line_cap: 0,
            line_join: 0,
            miter_limit: 4.0,
            dash: None,
            closed: true,
            name: None,
            opacity: 1.0,
            clip: false,
        }))
    }

    fn parse_line(&self, el: &SvgElement) -> Option<AiObject> {
        let x1 = el
            .attrs
            .get("x1")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let y1 = el
            .attrs
            .get("y1")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let x2 = el
            .attrs
            .get("x2")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
        let y2 = el
            .attrs
            .get("y2")
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);

        let segments = vec![
            PathSegment {
                seg_type: SegmentType::Moveto,
                points: vec![Point { x: x1, y: y1 }],
                smooth: true,
            },
            PathSegment {
                seg_type: SegmentType::Lineto,
                points: vec![Point { x: x2, y: y2 }],
                smooth: true,
            },
        ];

        let stroke = self.parse_color(el.attrs.get("stroke").map(|s| s.as_str()));
        let stroke_none = el.attrs.get("stroke").map(|s| s.as_str()) == Some("none");

        Some(AiObject::Path(AiPath {
            segments,
            fill: None,
            stroke: if stroke_none { None } else { stroke },
            stroke_width: el
                .attrs
                .get("stroke-width")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(1.0),
            line_cap: 0,
            line_join: 0,
            miter_limit: 4.0,
            dash: None,
            closed: false,
            name: None,
            opacity: 1.0,
            clip: false,
        }))
    }

    fn parse_polyline(&self, el: &SvgElement, closed: bool) -> Option<AiObject> {
        let points_str = el.attrs.get("points")?;
        if points_str.is_empty() {
            return None;
        }

        let nums: Vec<f64> = points_str
            .split(|c: char| c == ',' || c.is_whitespace())
            .filter(|s| !s.is_empty())
            .filter_map(|s| s.parse::<f64>().ok())
            .collect();

        if nums.len() < 4 {
            return None;
        }

        let mut segments = Vec::new();
        segments.push(PathSegment {
            seg_type: SegmentType::Moveto,
            points: vec![Point {
                x: nums[0],
                y: nums[1],
            }],
            smooth: true,
        });
        for i in (2..nums.len() - 1).step_by(2) {
            segments.push(PathSegment {
                seg_type: SegmentType::Lineto,
                points: vec![Point {
                    x: nums[i],
                    y: nums[i + 1],
                }],
                smooth: true,
            });
        }
        if closed {
            segments.push(PathSegment {
                seg_type: SegmentType::Closepath,
                points: vec![],
                smooth: true,
            });
        }

        let fill = self.parse_color(el.attrs.get("fill").map(|s| s.as_str()));
        let stroke = self.parse_color(el.attrs.get("stroke").map(|s| s.as_str()));
        let fill_none = el.attrs.get("fill").map(|s| s.as_str()) == Some("none");
        let stroke_none = el.attrs.get("stroke").map(|s| s.as_str()) == Some("none");

        Some(AiObject::Path(AiPath {
            segments,
            fill: if fill_none { None } else { fill },
            stroke: if stroke_none { None } else { stroke },
            stroke_width: el
                .attrs
                .get("stroke-width")
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(1.0),
            line_cap: 0,
            line_join: 0,
            miter_limit: 4.0,
            dash: None,
            closed,
            name: None,
            opacity: 1.0,
            clip: false,
        }))
    }

    fn parse_color(&self, value: Option<&str>) -> Option<Color> {
        let value = value?;
        let value = value.trim();
        if value.is_empty() || value == "none" {
            return None;
        }

        let url_re = regex_lite::Regex::new(r"url\(#([^)]+)\)").unwrap();
        if let Some(cap) = url_re.captures(value) {
            if let Some(grad_id) = cap.get(1) {
                return self
                    .gradient_defs
                    .get(grad_id.as_str())
                    .cloned()
                    .map(Color::Gradient);
            }
            return None;
        }

        self.parse_solid_color(value)
    }

    fn parse_solid_color(&self, value: &str) -> Option<Color> {
        let value = value.trim();
        if value.is_empty() || value == "none" {
            return None;
        }

        let value = match value.to_lowercase() {
            ref s if CSS_COLORS.contains_key(s.as_str()) => {
                let hex = CSS_COLORS[s.as_str()];
                if hex.is_empty() {
                    return None;
                }
                return self.resolve_rgb_color(hex);
            }
            _ => value.to_string(),
        };

        let hex_re = regex_lite::Regex::new(r"^#([0-9a-fA-F]{3,8})$").unwrap();
        if let Some(cap) = hex_re.captures(&value) {
            let hex_str = cap.get(1).unwrap().as_str();
            let expanded = if hex_str.len() == 3 {
                hex_str
                    .chars()
                    .flat_map(|c| [c, c])
                    .collect::<String>()
            } else {
                hex_str.to_string()
            };
            if expanded.len() >= 6
                && let (Ok(r), Ok(g), Ok(b)) = (
                    u8::from_str_radix(&expanded[0..2], 16),
                    u8::from_str_radix(&expanded[2..4], 16),
                    u8::from_str_radix(&expanded[4..6], 16),
                ) {
                    return self.resolve_rgb_color(&format!(
                        "#{:02x}{:02x}{:02x}",
                        r, g, b
                    ));
                }
            return None;
        }

        let rgb_re =
            regex_lite::Regex::new(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)").unwrap();
        if let Some(cap) = rgb_re.captures(&value) {
            let r = cap.get(1).unwrap().as_str().parse::<f64>().ok()? / 255.0;
            let g = cap.get(2).unwrap().as_str().parse::<f64>().ok()? / 255.0;
            let b = cap.get(3).unwrap().as_str().parse::<f64>().ok()? / 255.0;
            let hex_val = format!(
                "#{:02x}{:02x}{:02x}",
                (r * 255.0) as u8,
                (g * 255.0) as u8,
                (b * 255.0) as u8
            );
            return self.resolve_rgb_color(&hex_val);
        }

        None
    }

    fn resolve_rgb_color(&self, hex_val: &str) -> Option<Color> {
        let hex_lower = hex_val.to_lowercase();

        if let Some(ref meta) = self.metadata
            && let Some(entry) = meta.color_hex_map.get(&hex_lower) {
                let color_type = entry.get("type").and_then(|v| v.as_str()).unwrap_or("");
                if color_type == "spot" || entry.get("name").and_then(|v| v.as_str()).is_some() {
                    return Some(Color::Spot(SpotColor {
                        name: entry
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        cyan: entry.get("cyan").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        magenta: entry.get("magenta").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        yellow: entry.get("yellow").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        black: entry.get("black").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        tint: entry.get("tint").and_then(|v| v.as_f64()).unwrap_or(1.0),
                    }));
                } else if color_type == "cmyk" {
                    return Some(Color::Cmyk(CmykColor {
                        cyan: entry.get("cyan").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        magenta: entry.get("magenta").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        yellow: entry.get("yellow").and_then(|v| v.as_f64()).unwrap_or(0.0),
                        black: entry.get("black").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    }));
                } else if color_type == "gray" {
                    return Some(Color::Gray(GrayColor {
                        gray: entry.get("gray").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    }));
                }
            }

        let hex_body = hex_val.trim_start_matches('#');
        if let (Ok(r), Ok(g), Ok(b)) = (
            u8::from_str_radix(&hex_body[0..2], 16),
            u8::from_str_radix(&hex_body[2..4], 16),
            u8::from_str_radix(&hex_body[4..6], 16),
        ) {
            let rf = r as f64 / 255.0;
            let gf = g as f64 / 255.0;
            let bf = b as f64 / 255.0;

            if let Some(ref meta) = self.metadata
                && meta.color_mode == "CMYK" {
                    return Some(Color::Cmyk(CmykColor::from_rgb(rf, gf, bf)));
                }
            return Some(Color::Rgb(RgbColor {
                red: rf,
                green: gf,
                blue: bf,
            }));
        }

        None
    }

    fn collect_used_spot_colors(&self, doc: &mut AiDocument) {
        let mut seen = std::collections::HashSet::new();
        for color in doc.collect_colors() {
            if let Color::Spot(sc) = &color
                && seen.insert(sc.name.clone()) {
                    doc.spot_colors.push(SpotColor {
                        name: sc.name.clone(),
                        cyan: sc.cyan,
                        magenta: sc.magenta,
                        yellow: sc.yellow,
                        black: sc.black,
                        tint: sc.tint,
                    });
                }
        }
    }
}

fn find_descendants<'a>(root: &'a SvgElement, name: &str) -> Vec<&'a SvgElement> {
    let mut result = Vec::new();
    for child in &root.children {
        if child.name == name {
            result.push(child);
        }
        result.extend(find_descendants(child, name));
    }
    result
}

fn parse_linecap(value: &str) -> u8 {
    match value {
        "round" => 1,
        "square" => 2,
        _ => 0,
    }
}

fn parse_linejoin(value: &str) -> u8 {
    match value {
        "round" => 1,
        "bevel" => 2,
        _ => 0,
    }
}

fn parse_dasharray(
    dasharray: Option<&str>,
    dashoffset: Option<&str>,
) -> Option<(Vec<f64>, f64)> {
    let arr_str = dasharray?;
    if arr_str.is_empty() || arr_str == "none" {
        return None;
    }
    let arr: Vec<f64> = arr_str
        .replace(',', " ")
        .split_whitespace()
        .filter_map(|s| s.parse::<f64>().ok())
        .collect();
    if arr.is_empty() {
        return None;
    }
    let offset = dashoffset
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);
    Some((arr, offset))
}

fn has_closepath(segments: &[PathSegment]) -> bool {
    segments.iter().any(|s| s.seg_type == SegmentType::Closepath)
}

static CSS_COLORS: LazyLock<HashMap<&'static str, &'static str>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    m.insert("black", "#000000");
    m.insert("white", "#ffffff");
    m.insert("red", "#ff0000");
    m.insert("green", "#008000");
    m.insert("blue", "#0000ff");
    m.insert("yellow", "#ffff00");
    m.insert("cyan", "#00ffff");
    m.insert("magenta", "#ff00ff");
    m.insert("orange", "#ffa500");
    m.insert("gray", "#808080");
    m.insert("grey", "#808080");
    m.insert("none", "");
    m
});
