use crate::error::Result;
use crate::model::*;
use base64::Engine;

pub fn export_svg(document: &AiDocument) -> Result<String> {
    let mut exporter = SvgExporter {
        document,
        defs: Vec::new(),
        clip_counter: 0,
        gradient_counter: 0,
    };
    Ok(exporter.export())
}

struct SvgExporter<'a> {
    document: &'a AiDocument,
    defs: Vec<String>,
    clip_counter: u32,
    gradient_counter: u32,
}

impl<'a> SvgExporter<'a> {
    fn export(&mut self) -> String {
        let bbox = self
            .document
            .bounding_box
            .clone()
            .unwrap_or(BoundingBox { x: 0.0, y: 0.0, width: 612.0, height: 792.0 });

        let mut layers_xml = String::new();
        for layer in &self.document.layers {
            let layer_xml = self.export_layer(layer);
            layers_xml.push_str(&layer_xml);
        }

        let mut defs_xml = String::new();
        for def in &self.defs {
            defs_xml.push_str("    ");
            defs_xml.push_str(def);
            defs_xml.push('\n');
        }

        let flip_y = bbox.y + bbox.height + bbox.y;
        let flip_transform = format!("translate(0,{}) scale(1,-1)", fmt_float(flip_y));

        let defs_section = if defs_xml.is_empty() {
            String::new()
        } else {
            format!("  <defs>\n{}  </defs>\n", defs_xml)
        };

        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vbx} {vby} {vbw} {vbh}" width="{w}" height="{h}" version="1.1">
{defs}  <g transform="{flip}">
{layers}  </g>
</svg>"#,
            vbx = fmt_float(bbox.x),
            vby = fmt_float(bbox.y),
            vbw = fmt_float(bbox.width),
            vbh = fmt_float(bbox.height),
            w = fmt_float(bbox.width),
            h = fmt_float(bbox.height),
            defs = defs_section,
            flip = flip_transform,
            layers = layers_xml,
        )
    }

    fn export_layer(&mut self, layer: &AiLayer) -> String {
        let mut xml = String::with_capacity(512);
        let id = sanitize_id(&layer.name);
        xml.push_str("    <g id=\"");
        xml.push_str(&attr_escape(&id));
        if !layer.visible {
            xml.push_str("\" visibility=\"hidden");
        }
        xml.push_str("\">\n");
        for obj in &layer.children {
            if let Some(obj_xml) = self.export_object(obj) {
                xml.push_str(&obj_xml);
            }
        }
        xml.push_str("    </g>\n");
        xml
    }

    fn export_object(&mut self, obj: &AiObject) -> Option<String> {
        match obj {
            AiObject::Path(p) => self.export_path(p),
            AiObject::Group(g) => self.export_group(g),
            AiObject::CompoundPath(c) => self.export_compound_path(c),
            AiObject::Text(t) => self.export_text(t),
            AiObject::Image(img) => self.export_image(img),
        }
    }

    fn export_path(&mut self, path: &AiPath) -> Option<String> {
        let d = segments_to_d(&path.segments);
        if d.is_empty() {
            return None;
        }

        let mut parts = vec![format!("d=\"{}\"", attr_escape(&d))];

        let fill = self.color_to_css(&path.fill);
        parts.push(format!("fill=\"{}\"", fill));

        if let Some(ref stroke) = path.stroke {
            let stroke_css = self.resolve_color(stroke);
            parts.push(format!("stroke=\"{}\"", stroke_css));
            if (path.stroke_width - 1.0).abs() > f64::EPSILON {
                parts.push(format!("stroke-width=\"{}\"", fmt_float(path.stroke_width)));
            }
            if path.line_cap != 0 {
                let cap = ["butt", "round", "square"][path.line_cap as usize];
                parts.push(format!("stroke-linecap=\"{}\"", cap));
            }
            if path.line_join != 0 {
                let join = ["miter", "round", "bevel"][path.line_join as usize];
                parts.push(format!("stroke-linejoin=\"{}\"", join));
            }
            if (path.miter_limit - 10.0).abs() > f64::EPSILON {
                parts.push(format!("stroke-miterlimit=\"{}\"", fmt_float(path.miter_limit)));
            }
            if let Some((ref arr, offset)) = path.dash {
                let arr_str: Vec<String> = arr.iter().map(|v| fmt_float(*v)).collect();
                parts.push(format!("stroke-dasharray=\"{}\"", arr_str.join(" ")));
                if offset.abs() > f64::EPSILON {
                    parts.push(format!("stroke-dashoffset=\"{}\"", fmt_float(offset)));
                }
            }
        } else {
            parts.push("stroke=\"none\"".to_string());
        }

        Some(format!("      <path {}/>\n", parts.join(" ")))
    }

    fn export_group(&mut self, group: &AiGroup) -> Option<String> {
        let mut xml = String::with_capacity(512);
        let id = group.name.as_ref().map(|n| sanitize_id(n));

        if group.clipped && !group.children.is_empty() {
            let clip_id = format!("clip-{}", self.clip_counter);
            self.clip_counter += 1;

            let first = &group.children[0];
            if let AiObject::Path(clip_path) = first {
                let clip_d = segments_to_d(&clip_path.segments);
                if !clip_d.is_empty() {
                    self.defs.push(format!(
                        "<clipPath id=\"{}\"><path d=\"{}\"/></clipPath>",
                        clip_id,
                        attr_escape(&clip_d)
                    ));
                    xml.push_str("      <g");
                    if let Some(ref i) = id {
                        xml.push_str(&format!(" id=\"{}\"", attr_escape(i)));
                    }
                    xml.push_str(&format!(" clip-path=\"url(#{})\">\n", clip_id));

                    for obj in group.children.iter().skip(1) {
                        if let Some(obj_xml) = self.export_object(obj) {
                            xml.push_str(&obj_xml);
                        }
                    }
                    xml.push_str("      </g>\n");
                    return Some(xml);
                }
            }
        }

        xml.push_str("      <g");
        if let Some(ref i) = id {
            xml.push_str(&format!(" id=\"{}\"", attr_escape(i)));
        }
        xml.push_str(">\n");
        for obj in &group.children {
            if let Some(obj_xml) = self.export_object(obj) {
                xml.push_str(&obj_xml);
            }
        }
        xml.push_str("      </g>\n");
        Some(xml)
    }

    fn export_compound_path(&mut self, compound: &AiCompoundPath) -> Option<String> {
        let mut all_d = Vec::new();
        for subpath in &compound.subpaths {
            let d = segments_to_d(&subpath.segments);
            if !d.is_empty() {
                all_d.push(d);
            }
        }
        if all_d.is_empty() {
            return None;
        }

        let mut parts = vec![format!("d=\"{}\"", attr_escape(&all_d.join(" ")))];
        parts.push("fill-rule=\"evenodd\"".to_string());

        let fill = self.color_to_css(&compound.fill);
        parts.push(format!("fill=\"{}\"", fill));

        if let Some(stroke) = &compound.stroke {
            let stroke_css = self.resolve_color(stroke);
            parts.push(format!("stroke=\"{}\"", stroke_css));
            if (compound.stroke_width - 1.0).abs() > f64::EPSILON {
                parts.push(format!("stroke-width=\"{}\"", fmt_float(compound.stroke_width)));
            }
        } else {
            parts.push("stroke=\"none\"".to_string());
        }

        Some(format!("      <path {}/>\n", parts.join(" ")))
    }

    fn export_text(&mut self, text: &AiText) -> Option<String> {
        if text.content.is_empty() {
            return None;
        }

        let mut parts = vec![
            format!("font-family=\"{}\"", safe_font_name(&text.font)),
            format!("font-size=\"{}\"", fmt_float(text.size)),
        ];

        if !text.transform.is_identity() {
            parts.push(format!("transform=\"{}\"", text.transform.svg_transform()));
        }

        if let Some(ref f) = text.fill {
            parts.push(format!("fill=\"{}\"", f.to_hex()));
        }
        if let Some(ref s) = text.stroke {
            parts.push(format!("stroke=\"{}\"", s.to_hex()));
        }

        Some(format!(
            "      <text {}>{}</text>\n",
            parts.join(" "),
            text_content_escape(&text.content)
        ))
    }

    fn export_image(&mut self, image: &AiImage) -> Option<String> {
        if image.data.is_empty() {
            let x = fmt_float(image.transform.e);
            let y = fmt_float(image.transform.f);
            return Some(format!(
                "      <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"#cccccc\" stroke=\"#999999\"/>\n",
                x, y, image.width, image.height
            ));
        }

        let encoded = base64::engine::general_purpose::STANDARD.encode(&image.data);
        let mut parts = vec![
            format!("x=\"{}\"", fmt_float(image.transform.e)),
            format!("y=\"{}\"", fmt_float(image.transform.f)),
            format!("width=\"{}\"", image.width),
            format!("height=\"{}\"", image.height),
            format!("href=\"data:image/png;base64,{}\"", encoded),
        ];

        if !image.transform.is_identity() {
            parts.push(format!("transform=\"{}\"", image.transform.svg_transform()));
        }

        Some(format!("      <image {}/>\n", parts.join(" ")))
    }

    fn color_to_css(&mut self, color: &Option<Color>) -> String {
        match color {
            None => "none".to_string(),
            Some(c) => self.resolve_color(c),
        }
    }

    fn resolve_color(&mut self, color: &Color) -> String {
        match color {
            Color::Gradient(g) => self.create_gradient_def(g),
            _ => color.to_hex(),
        }
    }

    fn create_gradient_def(&mut self, gradient: &GradientColor) -> String {
        let id = format!("gradient-{}", self.gradient_counter);
        self.gradient_counter += 1;

        let grad_type = if gradient.gradient_type == 0 {
            "linearGradient"
        } else {
            "radialGradient"
        };

        let mut xml = format!("<{} id=\"{}\"", grad_type, id);

        if !gradient.transform.is_identity() {
            xml.push_str(&format!(
                " gradientTransform=\"{}\"",
                gradient.transform.svg_transform()
            ));
        }
        xml.push_str(">\n");

        for stop in &gradient.stops {
            xml.push_str(&format!(
                "      <stop offset=\"{}\" stop-color=\"{}\"/>\n",
                fmt_float(stop.offset),
                stop.color.to_hex(),
            ));
        }
        xml.push_str(&format!("    </{}>", grad_type));
        self.defs.push(xml);

        format!("url(#{})", id)
    }
}

fn segments_to_d(segments: &[PathSegment]) -> String {
    let parts: Vec<String> = segments.iter().map(|s| s.svg_command()).collect();
    parts.join(" ")
}

fn sanitize_id(name: &str) -> String {
    let mut result = String::with_capacity(name.len());
    for ch in name.chars() {
        if ch.is_alphanumeric() || ch == '-' || ch == '_' {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    if result.is_empty() {
        result.push_str("unnamed");
    }
    result
}

fn safe_font_name(font: &str) -> String {
    let cleaned: String = font.chars().filter(|&c| c.is_ascii() && !c.is_ascii_control()).take(128).collect();
    if cleaned.is_empty() {
        "Helvetica".to_string()
    } else {
        cleaned
    }
}

fn fmt_float(v: f64) -> String {
    if v == v.trunc() && v.is_finite() {
        format!("{}", v as i64)
    } else {
        let s = format!("{:.4}", v);
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        trimmed.to_string()
    }
}

fn attr_escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '"' => escaped.push_str("&quot;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn text_content_escape(s: &str) -> String {
    let mut escaped = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}
