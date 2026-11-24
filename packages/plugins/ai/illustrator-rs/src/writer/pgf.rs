use std::collections::HashSet;

use crate::error::Result;
use crate::export::metadata::AiMetadata;
use crate::model::*;

pub struct PgfWriter {
    document: AiDocument,
    metadata: Option<AiMetadata>,
    lines: Vec<String>,
    gradient_defs_written: HashSet<String>,
}

impl PgfWriter {
    pub fn new(document: AiDocument, metadata: Option<AiMetadata>) -> Self {
        PgfWriter {
            document,
            metadata,
            lines: Vec::new(),
            gradient_defs_written: HashSet::new(),
        }
    }

    pub fn write(&mut self) -> Result<String> {
        self.lines.clear();

        let lossless = self
            .metadata
            .as_ref()
            .map(|m| !m.layer_pgf.is_empty() && m.trusted)
            .unwrap_or(false);
        let trust_sidecar = self
            .metadata
            .as_ref()
            .map(|m| m.trusted)
            .unwrap_or(false);

        match self.metadata.as_ref().and_then(|m| m.prolog_data.as_ref()) {
            Some(prolog) if trust_sidecar => {
                self.emit(prolog.trim_end().to_string());
            }
            Some(prolog) => {
                self.emit(Self::validate_ps_section(prolog).trim_end().to_string());
            }
            None => {
                self.write_header();
                self.write_prolog();
                self.write_setup();
            }
        }

        if lossless {
            self.write_layers_raw();
        } else {
            self.collect_and_write_gradients();
            self.write_layers();
        }

        self.write_trailer();

        if lossless
            && let Some(ref meta) = self.metadata
                && let Some(ref prolog) = meta.prolog_data {
                    let le = if prolog.contains("\r\n") {
                        "\r\n"
                    } else {
                        "\n"
                    };
                    return Ok(self.lines.join(le) + le);
                }

        Ok(self.lines.join("\n") + "\n")
    }

    fn emit(&mut self, line: String) {
        self.lines.push(line);
    }

    fn write_header(&mut self) {
        let bbox = self
            .document
            .bounding_box
            .clone()
            .unwrap_or(BoundingBox {
                x: 0.0,
                y: 0.0,
                width: 612.0,
                height: 792.0,
            });
        let llx = bbox.x as i64;
        let lly = bbox.y as i64;
        let urx = (bbox.x + bbox.width) as i64;
        let ury = (bbox.y + bbox.height) as i64;

        self.emit("%!PS-Adobe-3.0".to_string());
        if !self.document.title.is_empty() {
            self.emit(format!(
                "%%Title: ({})",
                Self::ps_escape(&self.document.title)
            ));
        }
        self.emit(format!(
            "%%Creator: {}",
            if self.document.creator.is_empty() {
                "ai-exporter"
            } else {
                &self.document.creator
            }
        ));
        self.emit(format!("%%BoundingBox: {llx} {lly} {urx} {ury}"));
        self.emit(format!(
            "%%HiResBoundingBox: {:.4} {:.4} {:.4} {:.4}",
            bbox.x,
            bbox.y,
            bbox.x + bbox.width,
            bbox.y + bbox.height
        ));

        if self.document.color_mode == "CMYK" {
            self.emit("%%DocumentProcessColors: Cyan Magenta Yellow Black".to_string());
        } else {
            self.emit("%%DocumentProcessColors: Red Green Blue".to_string());
        }

        let spot_colors: Vec<_> = self.document.spot_colors.clone();
        if !spot_colors.is_empty() {
            let names: Vec<String> = spot_colors
                .iter()
                .map(|sc| format!("({})", Self::ps_escape(&sc.name)))
                .collect();
            self.emit(format!("%%DocumentCustomColors: {}", names.join(" ")));
            for sc in &spot_colors {
                self.emit(format!(
                    "%%CMYKCustomColor: {} {} {} {} ({})",
                    Self::fmt(sc.cyan),
                    Self::fmt(sc.magenta),
                    Self::fmt(sc.yellow),
                    Self::fmt(sc.black),
                    Self::ps_escape(&sc.name)
                ));
            }
        }

        if !self.document.fonts_used.is_empty() {
            let safe_fonts: Vec<String> = self
                .document
                .fonts_used
                .iter()
                .map(|f| {
                    let mut safe = String::with_capacity(f.len());
                    for c in f.chars() {
                        if c.is_alphanumeric() || c == '-' || c == '+' || c == '.' {
                            safe.push(c);
                        }
                    }
                    safe
                })
                .collect();
            self.emit(format!("%%DocumentFonts: {}", safe_fonts.join(" ")));
        }

        let version = if self.document.version.is_empty() {
            "14.0"
        } else {
            &self.document.version
        };
        let version_num = extract_version_num(version);
        self.emit(format!("%AI5_FileFormat {version_num}"));

        if self.document.color_mode == "CMYK" {
            self.emit("%AI9_ColorModel: 2".to_string());
        } else {
            self.emit("%AI9_ColorModel: 1".to_string());
        }

        self.emit(format!("%AI5_NumLayers: {}", self.document.layers.len()));
        self.emit("%%EndComments".to_string());
    }

    fn write_prolog(&mut self) {
        self.emit("%%BeginProlog".to_string());
        self.emit("%%EndProlog".to_string());
    }

    fn write_setup(&mut self) {
        self.emit("%%BeginSetup".to_string());
        self.emit("%%EndSetup".to_string());
    }

    fn collect_and_write_gradients(&mut self) {
        let mut gradients: Vec<GradientColor> = Vec::new();
        self.collect_gradients(&mut gradients);

        for grad in &gradients {
            if self.gradient_defs_written.contains(&grad.name) {
                continue;
            }
            self.write_gradient_def(grad);
            self.gradient_defs_written.insert(grad.name.clone());
        }
    }

    fn collect_gradients(&self, out: &mut Vec<GradientColor>) {
        for layer in &self.document.layers {
            for obj in &layer.children {
                self.collect_gradients_from_object(obj, out);
            }
        }
    }

    fn collect_gradients_from_object(&self, obj: &AiObject, out: &mut Vec<GradientColor>) {
        match obj {
            AiObject::Path(p) => {
                Self::collect_grad_opt(&p.fill, out);
                Self::collect_grad_opt(&p.stroke, out);
            }
            AiObject::Group(g) => {
                for child in &g.children {
                    self.collect_gradients_from_object(child, out);
                }
            }
            AiObject::CompoundPath(c) => {
                Self::collect_grad_opt(&c.fill, out);
                Self::collect_grad_opt(&c.stroke, out);
                for subpath in &c.subpaths {
                    Self::collect_grad_opt(&subpath.fill, out);
                    Self::collect_grad_opt(&subpath.stroke, out);
                }
            }
            AiObject::Text(t) => {
                Self::collect_grad_opt(&t.fill, out);
                Self::collect_grad_opt(&t.stroke, out);
            }
            AiObject::Image(_) => {}
        }
    }

    fn collect_grad_opt(color: &Option<Color>, out: &mut Vec<GradientColor>) {
        if let Some(Color::Gradient(g)) = color {
            out.push(g.clone());
        }
    }

    fn write_gradient_def(&mut self, grad: &GradientColor) {
        self.emit(format!(
            "%_Bd ({}) {}",
            Self::ps_escape(&grad.name),
            grad.gradient_type
        ));
        for stop in &grad.stops {
            let offset_pct = Self::fmt(stop.offset * 100.0);
            match stop.color.as_ref() {
                Color::Cmyk(c) => {
                    self.emit(format!(
                        "%_{} 0 {} {} {} {} 1 Bs",
                        offset_pct,
                        Self::fmt(c.cyan),
                        Self::fmt(c.magenta),
                        Self::fmt(c.yellow),
                        Self::fmt(c.black),
                    ));
                }
                Color::Rgb(c) => {
                    self.emit(format!(
                        "%_{} 0 {} {} {} 2 Bs",
                        offset_pct,
                        Self::fmt(c.red),
                        Self::fmt(c.green),
                        Self::fmt(c.blue),
                    ));
                }
                Color::Gray(c) => {
                    self.emit(format!("%_{} 0 {} 3 Bs", offset_pct, Self::fmt(c.gray)));
                }
                _ => {}
            }
        }
        self.emit("%_BD".to_string());
    }

    fn write_layers_raw(&mut self) {
        let entries: Vec<_> = self
            .metadata
            .as_ref()
            .map(|m| m.layer_pgf.clone())
            .unwrap_or_default();
        for entry in &entries {
            self.emit(entry.pgf.clone());
        }
    }

    fn write_layers(&mut self) {
        let layers: Vec<_> = self.document.layers.clone();
        for (i, layer) in layers.iter().enumerate() {
            self.write_layer(layer, i);
        }
    }

    fn write_layer(&mut self, layer: &AiLayer, _index: usize) {
        self.emit("%AI5_BeginLayer".to_string());

        let visible = if layer.visible { 1 } else { 0 };
        let preview = 1;
        let enabled = if layer.locked { 0 } else { 1 };
        let printing = if layer.printable { 1 } else { 0 };
        let (r, g, b) = layer.color;

        self.emit(format!(
            "{visible} {preview} {enabled} {printing} 0 0 1 0 {r} {g} {b} 0 50 0 Lb"
        ));
        self.emit(format!("({}) Ln", Self::ps_escape(&layer.name)));

        for obj in &layer.children {
            self.write_object(obj);
        }

        self.emit("LB".to_string());
        self.emit("%AI5_EndLayer--".to_string());
    }

    fn write_object(&mut self, obj: &AiObject) {
        match obj {
            AiObject::Path(p) => self.write_path(p),
            AiObject::Group(g) => self.write_group(g),
            AiObject::CompoundPath(c) => self.write_compound_path(c),
            AiObject::Text(t) => self.write_text(t),
            AiObject::Image(i) => self.write_image(i),
        }
    }

    fn write_path(&mut self, path: &AiPath) {
        self.write_color_state(
            &path.fill,
            &path.stroke,
            path.stroke_width,
            path.line_cap,
            path.line_join,
            path.miter_limit,
            &path.dash,
        );
        self.write_segments(&path.segments);
        self.write_render_op(path.fill.is_some(), path.stroke.is_some(), path.closed);
    }

    #[allow(clippy::too_many_arguments)]
    fn write_color_state(
        &mut self,
        fill: &Option<Color>,
        stroke: &Option<Color>,
        stroke_width: f64,
        line_cap: u8,
        line_join: u8,
        miter_limit: f64,
        dash: &Option<(Vec<f64>, f64)>,
    ) {
        if (stroke_width - 1.0).abs() > f64::EPSILON {
            self.emit(format!("{} w", Self::fmt(stroke_width)));
        }
        if line_cap != 0 {
            self.emit(format!("{line_cap} J"));
        }
        if line_join != 0 {
            self.emit(format!("{line_join} j"));
        }
        if (miter_limit - 10.0).abs() > f64::EPSILON {
            self.emit(format!("{} M", Self::fmt(miter_limit)));
        }
        if let Some((arr, offset)) = dash {
            let arr_str: Vec<String> = arr.iter().map(|v| Self::fmt(*v)).collect();
            self.emit(format!("[{}] {} d", arr_str.join(" "), Self::fmt(*offset)));
        }

        if let Some(ref c) = *fill {
            self.emit(Self::format_color_fill(c));
        }
        if let Some(ref c) = *stroke {
            self.emit(Self::format_color_stroke(c));
        }
    }

    fn write_segments(&mut self, segments: &[PathSegment]) {
        for seg in segments {
            match seg.seg_type {
                SegmentType::Moveto => {
                    if let Some(p) = seg.points.first() {
                        self.emit(format!("{} {} m", Self::fmt(p.x), Self::fmt(p.y)));
                    }
                }
                SegmentType::Lineto => {
                    if let Some(p) = seg.points.first() {
                        let op = if seg.smooth { "l" } else { "L" };
                        self.emit(format!("{} {} {op}", Self::fmt(p.x), Self::fmt(p.y)));
                    }
                }
                SegmentType::Curveto => {
                    if seg.points.len() >= 3 {
                        let p1 = &seg.points[0];
                        let p2 = &seg.points[1];
                        let p3 = &seg.points[2];
                        let op = if seg.smooth { "c" } else { "C" };
                        self.emit(format!(
                            "{} {} {} {} {} {} {op}",
                            Self::fmt(p1.x),
                            Self::fmt(p1.y),
                            Self::fmt(p2.x),
                            Self::fmt(p2.y),
                            Self::fmt(p3.x),
                            Self::fmt(p3.y),
                        ));
                    }
                }
                SegmentType::Closepath => {}
            }
        }
    }

    fn write_render_op(&mut self, has_fill: bool, has_stroke: bool, closed: bool) {
        let op = match (has_fill, has_stroke, closed) {
            (true, true, true) => "b",
            (true, true, false) => "B",
            (true, false, true) => "f",
            (true, false, false) => "F",
            (false, true, true) => "s",
            (false, true, false) => "S",
            (false, false, true) => "n",
            (false, false, false) => "N",
        };
        self.emit(op.to_string());
    }

    fn write_group(&mut self, group: &AiGroup) {
        self.emit("u".to_string());
        if group.clipped && !group.children.is_empty() {
            let first = &group.children[0];
            if let AiObject::Path(path) = first {
                if path.clip {
                    self.write_segments(&path.segments);
                    self.emit("W".to_string());
                    self.emit("n".to_string());
                    for child in group.children.iter().skip(1) {
                        self.write_object(child);
                    }
                } else {
                    for child in &group.children {
                        self.write_object(child);
                    }
                }
            } else {
                for child in &group.children {
                    self.write_object(child);
                }
            }
        } else {
            for child in &group.children {
                self.write_object(child);
            }
        }
        self.emit("U".to_string());
    }

    fn write_compound_path(&mut self, compound: &AiCompoundPath) {
        self.emit("*u".to_string());
        if !compound.subpaths.is_empty() {
            self.write_color_state(
                &compound.fill,
                &compound.stroke,
                compound.stroke_width,
                0,
                0,
                10.0,
                &None,
            );
        }

        for subpath in &compound.subpaths {
            self.write_segments(&subpath.segments);
            let has_fill = compound.fill.is_some();
            let has_stroke = compound.stroke.is_some();
            self.write_render_op(has_fill, has_stroke, subpath.closed);
        }

        self.emit("*U".to_string());
    }

    fn write_text(&mut self, text: &AiText) {
        self.emit(format!("{} To", text.text_type));

        self.emit(format!(
            "({}) {} Tf",
            Self::ps_escape(&text.font),
            Self::fmt(text.size)
        ));

        let t = &text.transform;
        self.emit(format!(
            "{} {} {} {} {} {} Tp",
            Self::fmt(t.a),
            Self::fmt(t.b),
            Self::fmt(t.c),
            Self::fmt(t.d),
            Self::fmt(t.e),
            Self::fmt(t.f),
        ));
        self.emit("TP".to_string());

        if let Some(ref c) = text.fill {
            self.emit(Self::format_color_fill(c));
        }
        if let Some(ref c) = text.stroke {
            self.emit(Self::format_color_stroke(c));
        }

        self.emit(format!("({}) Tx", Self::ps_escape(&text.content)));
        self.emit("TO".to_string());
    }

    fn write_image(&mut self, image: &AiImage) {
        self.emit(format!(
            "{} {} {} {} {} {} {} {} {} XI",
            image.width,
            image.height,
            image.bits_per_component,
            Self::fmt(image.transform.a),
            Self::fmt(image.transform.b),
            Self::fmt(image.transform.c),
            Self::fmt(image.transform.d),
            Self::fmt(image.transform.e),
            Self::fmt(image.transform.f),
        ));
    }

    fn write_trailer(&mut self) {
        let trust_sidecar = self
            .metadata
            .as_ref()
            .map(|m| m.trusted)
            .unwrap_or(false);
        match self
            .metadata
            .as_ref()
            .and_then(|m| m.trailer_data.as_ref())
        {
            Some(trailer) if trust_sidecar => {
                self.emit(trailer.clone());
            }
            Some(trailer) => {
                self.emit(Self::validate_ps_section(trailer));
            }
            None => {
                self.emit("%%PageTrailer".to_string());
                self.emit("gsave annotatepage grestore showpage".to_string());
                self.emit("%%Trailer".to_string());
                self.emit("%%EOF".to_string());
            }
        }
    }

    fn format_color_fill(color: &Color) -> String {
        match color {
            Color::Cmyk(c) => format!(
                "{} {} {} {} k",
                Self::fmt(c.cyan),
                Self::fmt(c.magenta),
                Self::fmt(c.yellow),
                Self::fmt(c.black),
            ),
            Color::Rgb(c) => format!(
                "{} {} {} Xa",
                Self::fmt(c.red),
                Self::fmt(c.green),
                Self::fmt(c.blue),
            ),
            Color::Gray(c) => format!("{} g", Self::fmt(c.gray)),
            Color::Spot(s) => format!(
                "{} {} {} {} ({}) {} x",
                Self::fmt(s.cyan),
                Self::fmt(s.magenta),
                Self::fmt(s.yellow),
                Self::fmt(s.black),
                Self::ps_escape(&s.name),
                Self::fmt(1.0 - s.tint),
            ),
            Color::Gradient(g) => {
                if let Some(stop) = g.stops.first() {
                    return Self::format_color_fill(&stop.color);
                }
                "0 0 0 1 k".to_string()
            }
        }
    }

    fn format_color_stroke(color: &Color) -> String {
        match color {
            Color::Cmyk(c) => format!(
                "{} {} {} {} K",
                Self::fmt(c.cyan),
                Self::fmt(c.magenta),
                Self::fmt(c.yellow),
                Self::fmt(c.black),
            ),
            Color::Rgb(c) => format!(
                "{} {} {} XA",
                Self::fmt(c.red),
                Self::fmt(c.green),
                Self::fmt(c.blue),
            ),
            Color::Gray(c) => format!("{} G", Self::fmt(c.gray)),
            Color::Spot(s) => format!(
                "{} {} {} {} ({}) {} X",
                Self::fmt(s.cyan),
                Self::fmt(s.magenta),
                Self::fmt(s.yellow),
                Self::fmt(s.black),
                Self::ps_escape(&s.name),
                Self::fmt(1.0 - s.tint),
            ),
            Color::Gradient(g) => {
                if let Some(stop) = g.stops.first() {
                    return Self::format_color_stroke(&stop.color);
                }
                "0 0 0 1 K".to_string()
            }
        }
    }

    fn ps_escape(s: &str) -> String {
        let mut result = String::with_capacity(s.len() + 4);
        for c in s.chars() {
            match c {
                '\\' => result.push_str("\\\\"),
                '(' => result.push_str("\\("),
                ')' => result.push_str("\\)"),
                '\n' => result.push_str("\\n"),
                '\r' => result.push_str("\\r"),
                '\t' => result.push_str("\\t"),
                '\u{8}' => result.push_str("\\b"),
                '\u{c}' => result.push_str("\\f"),
                _ if (c as u32) < 0x20 => {
                    let code = c as u8;
                    result.push_str(&format!("\\{code:03o}"));
                }
                _ => result.push(c),
            }
        }
        result
    }

    fn validate_ps_section(data: &str) -> String {
        let mut safe = Vec::new();
        for line in data.lines() {
            let stripped = line.trim();
            if stripped.is_empty() || stripped.starts_with('%') {
                safe.push(line.to_string());
            }
        }
        safe.join("\n")
    }

    fn fmt(value: f64) -> String {
        if value == value.trunc() && value.is_finite() {
            return format!("{}", value as i64);
        }
        let s = format!("{value:.4}");
        let trimmed = s.trim_end_matches('0').trim_end_matches('.');
        trimmed.to_string()
    }
}

fn extract_version_num(version: &str) -> &str {
    for (i, c) in version.char_indices() {
        if c.is_ascii_digit() || c == '.' {
            let rest = &version[i..];
            let end = rest
                .find(|c: char| !c.is_ascii_digit() && c != '.')
                .unwrap_or(rest.len());
            return &rest[..end];
        }
    }
    "14.0"
}

pub fn write_pgf(document: &AiDocument, metadata: Option<&AiMetadata>) -> Result<String> {
    let mut writer = PgfWriter::new(document.clone(), metadata.cloned());
    writer.write()
}
