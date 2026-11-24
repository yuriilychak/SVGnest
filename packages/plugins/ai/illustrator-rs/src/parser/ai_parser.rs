use std::collections::HashMap;

use crate::error::Result;
use crate::model::*;
use crate::parser::lexer::{Token, TokenType};
use crate::parser::operators::get_operator;

const MAX_STACK_DEPTH: usize = 10_000;
const MAX_STATE_STACK: usize = 1_000;
const MAX_NESTING_DEPTH: usize = 1_000;
const MAX_ARRAY_DEPTH: usize = 100;
const MAX_DOCUMENT_OBJECTS: usize = 500_000;

#[derive(Debug, Clone)]
pub enum Value {
    Number(f64),
    String(String),
    Name(String),
    Array(Vec<Value>),
    Boolean(bool),
    Null,
}

impl From<f64> for Value {
    fn from(v: f64) -> Self {
        Value::Number(v)
    }
}

impl From<i32> for Value {
    fn from(v: i32) -> Self {
        Value::Number(v as f64)
    }
}

impl From<String> for Value {
    fn from(v: String) -> Self {
        Value::String(v)
    }
}

impl From<&str> for Value {
    fn from(v: &str) -> Self {
        Value::String(v.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct GraphicsState {
    pub fill: Option<Color>,
    pub stroke: Option<Color>,
    pub stroke_width: f64,
    pub line_cap: u8,
    pub line_join: u8,
    pub miter_limit: f64,
    pub dash: Option<(Vec<f64>, f64)>,
    pub transform: Matrix,
    pub clip: bool,
    pub opacity: f64,
}

impl Default for GraphicsState {
    fn default() -> Self {
        GraphicsState {
            fill: None,
            stroke: None,
            stroke_width: 1.0,
            line_cap: 0,
            line_join: 0,
            miter_limit: 10.0,
            dash: None,
            transform: Matrix::identity(),
            clip: false,
            opacity: 1.0,
        }
    }
}

pub struct AiParser {
    stack: Vec<Value>,
    graphics_state: GraphicsState,
    state_stack: Vec<GraphicsState>,
    document: AiDocument,
    current_layer: Option<AiLayer>,
    current_group: Option<AiGroup>,
    _current_path: Option<AiPath>,
    current_text: Option<AiText>,
    current_compound: Option<AiCompoundPath>,
    current_segments: Vec<PathSegment>,
    nesting: Vec<AiGroup>,
    in_text: bool,
    text_font: String,
    text_size: f64,
    text_transform: Matrix,
    gradient_defs: HashMap<String, GradientColor>,
    current_gradient_name: String,
    current_gradient_stops: Vec<GradientStop>,
    current_gradient_type: u8,
    in_gradient_def: bool,
    custom_colors: HashMap<(i32, i32, i32, i32), String>,
    object_count: usize,
    in_setup: bool,
    unknown_operators: Vec<String>,
    array_stack: Vec<Vec<Value>>,
    in_array: bool,
    metadata: HashMap<String, String>,
    fonts_used: Vec<String>,
    spot_colors: Vec<SpotColor>,
}

impl AiParser {
    pub fn new() -> Self {
        AiParser {
            stack: Vec::new(),
            graphics_state: GraphicsState::default(),
            state_stack: Vec::new(),
            document: AiDocument {
                layers: Vec::new(),
                version: String::new(),
                bounding_box: None,
                color_mode: String::new(),
                fonts_used: Vec::new(),
                spot_colors: Vec::new(),
                metadata: HashMap::new(),
                title: String::new(),
                creator: String::new(),
            },
            current_layer: None,
            current_group: None,
            _current_path: None,
            current_text: None,
            current_compound: None,
            current_segments: Vec::new(),
            nesting: Vec::new(),
            in_text: false,
            text_font: "Helvetica".to_string(),
            text_size: 12.0,
            text_transform: Matrix::identity(),
            gradient_defs: HashMap::new(),
            current_gradient_name: String::new(),
            current_gradient_stops: Vec::new(),
            current_gradient_type: 0,
            in_gradient_def: false,
            custom_colors: HashMap::new(),
            object_count: 0,
            in_setup: false,
            unknown_operators: Vec::new(),
            array_stack: Vec::new(),
            in_array: false,
            metadata: HashMap::new(),
            fonts_used: Vec::new(),
            spot_colors: Vec::new(),
        }
    }

    pub fn parse(&mut self, tokens: Vec<Token>) -> Result<AiDocument> {
        for token in &tokens {
            match token.token_type {
                TokenType::Eof => break,
                TokenType::Number => {
                    let val: f64 = token.value.parse().unwrap_or(0.0);
                    if self.in_array {
                        if let Some(arr) = self.array_stack.last_mut() {
                            arr.push(Value::Number(val));
                        }
                    } else {
                        self.push_stack(Value::Number(val));
                    }
                }
                TokenType::String => {
                    if self.in_array {
                        if let Some(arr) = self.array_stack.last_mut() {
                            arr.push(Value::String(token.value.clone()));
                        }
                    } else {
                        self.push_stack(Value::String(token.value.clone()));
                    }
                }
                TokenType::Name => {
                    if self.in_array {
                        if let Some(arr) = self.array_stack.last_mut() {
                            arr.push(Value::Name(token.value.clone()));
                        }
                    } else {
                        self.push_stack(Value::Name(token.value.clone()));
                    }
                }
                TokenType::ArrayStart => {
                    if self.array_stack.len() >= MAX_ARRAY_DEPTH {
                        continue;
                    }
                    self.array_stack.push(Vec::new());
                    self.in_array = true;
                }
                TokenType::ArrayEnd => {
                    if let Some(arr) = self.array_stack.pop() {
                        self.in_array = !self.array_stack.is_empty();
                        if self.in_array {
                            if let Some(parent) = self.array_stack.last_mut() {
                                parent.push(Value::Array(arr));
                            }
                        } else {
                            self.push_stack(Value::Array(arr));
                        }
                    }
                }
                TokenType::Operator => {
                    if self.in_array {
                        while let Some(arr) = self.array_stack.pop() {
                            self.push_stack(Value::Array(arr));
                        }
                        self.in_array = false;
                    }
                    self.dispatch(&token.value);
                }
                TokenType::Comment => {
                    self.handle_comment(&token.value);
                }
                TokenType::PseudoComment => {
                    self.handle_pseudo_comment(&token.value);
                }
            }
        }

        while self.current_group.is_some() {
            let group = self.current_group.take();
            self.current_group = self.nesting.pop();
            if let Some(g) = group
                && !g.children.is_empty() {
                    self.add_object(AiObject::Group(g));
                }
        }

        if let Some(ref layer) = self.current_layer
            && !self.document.layers.iter().any(|l| l.name == layer.name)
                && !layer.children.is_empty() {
                    self.document.layers.push(layer.clone());
                }

        self.document.layers.retain(|l| l.name != "Default Layer" || !l.children.is_empty());

        if self.document.version.is_empty() {
            self.document.version = "AI (unknown version)".to_string();
        }
        if !self.unknown_operators.is_empty() {
            self.unknown_operators.sort();
            self.unknown_operators.dedup();
            self.metadata.insert(
                "unknown_operators".to_string(),
                self.unknown_operators.join(", "),
            );
        }
        self.document.metadata = std::mem::take(&mut self.metadata);
        self.document.fonts_used = std::mem::take(&mut self.fonts_used);
        self.document.spot_colors = std::mem::take(&mut self.spot_colors);

        Ok(self.document.clone())
    }

    fn dispatch(&mut self, op_name: &str) {
        let op_def = get_operator(op_name);
        let op = match op_def {
            Some(o) => o,
            None => {
                if !self.unknown_operators.contains(&op_name.to_string()) {
                    self.unknown_operators.push(op_name.to_string());
                }
                return;
            }
        };

        match op.handler {
            "handle_moveto" => self.handle_moveto(),
            "handle_lineto" => self.handle_lineto(op_name),
            "handle_curveto" => self.handle_curveto(op_name),
            "handle_curveto_v" => self.handle_curveto_v(op_name),
            "handle_curveto_y" => self.handle_curveto_y(op_name),
            "handle_closepath" => self.handle_closepath(),
            "handle_render" => self.handle_render(op_name),
            "handle_gray_fill" => self.handle_gray_fill(),
            "handle_gray_stroke" => self.handle_gray_stroke(),
            "handle_cmyk_fill" => self.handle_cmyk_fill(),
            "handle_cmyk_stroke" => self.handle_cmyk_stroke(),
            "handle_rgb_fill" => self.handle_rgb_fill(),
            "handle_rgb_stroke" => self.handle_rgb_stroke(),
            "handle_spot_fill" => self.handle_spot_fill(),
            "handle_spot_stroke" => self.handle_spot_stroke(),
            "handle_custom_fill" => self.handle_custom_fill(),
            "handle_custom_stroke" => self.handle_custom_stroke(),
            "handle_line_width" => self.handle_line_width(),
            "handle_line_cap" => self.handle_line_cap(),
            "handle_line_join" => self.handle_line_join(),
            "handle_miter_limit" => self.handle_miter_limit(),
            "handle_dash" => self.handle_dash(),
            "handle_gsave" => self.handle_gsave(),
            "handle_grestore" => self.handle_grestore(),
            "handle_clip" => self.handle_clip(),
            "handle_concat_matrix" => self.handle_concat_matrix(),
            "handle_begin_group" => self.handle_begin_group(),
            "handle_end_group" => self.handle_end_group(),
            "handle_begin_compound" => self.handle_begin_compound(),
            "handle_end_compound" => self.handle_end_compound(),
            "handle_begin_layer" => self.handle_begin_layer(),
            "handle_end_layer" => self.handle_end_layer(),
            "handle_layer_name" => self.handle_layer_name(),
            "handle_begin_text" => self.handle_begin_text(),
            "handle_end_text" => self.handle_end_text(),
            "handle_text_path" => self.handle_text_path(),
            "handle_end_text_path" => self.handle_end_text_path(),
            "handle_text_render" => self.handle_text_render(),
            "handle_text_font" => self.handle_text_font(),
            "handle_begin_gradient" => self.handle_begin_gradient(),
            "handle_end_gradient" => self.handle_end_gradient(),
            "handle_begin_gradient_def" => self.handle_begin_gradient_def(),
            "handle_end_gradient_def" => self.handle_end_gradient_def(),
            "handle_gradient_stop" => self.handle_gradient_stop(),
            "handle_gradient_geometry" => self.handle_gradient_geometry(),
            "handle_raster_image" => self.handle_raster_image(),
            "handle_pop" => self.handle_pop(),
            "handle_null" => self.handle_null(),
            "handle_true" => self.handle_true(),
            "handle_false" => self.handle_false(),
            "handle_dup" => self.handle_dup(),
            "handle_exch" => self.handle_exch(),
            "handle_appearance_style" => self.handle_appearance_style(),
            "handle_appearance_end" => self.handle_appearance_end(),
            _ => self.handle_noop(op_name),
        }
    }

    fn push_stack(&mut self, value: Value) {
        if self.stack.len() >= MAX_STACK_DEPTH {
            return;
        }
        self.stack.push(value);
    }

    fn pop(&mut self) -> Value {
        self.stack.pop().unwrap_or(Value::Null)
    }

    fn pop_float(&mut self) -> f64 {
        match self.pop() {
            Value::Number(n) => n,
            Value::String(s) => s.parse().unwrap_or(0.0),
            Value::Name(s) => s.parse().unwrap_or(0.0),
            _ => 0.0,
        }
    }

    fn pop_int(&mut self) -> i32 {
        self.pop_float() as i32
    }

    fn pop_str(&mut self) -> String {
        match self.pop() {
            Value::String(s) => s,
            Value::Name(s) => s,
            Value::Number(n) => n.to_string(),
            Value::Boolean(b) => b.to_string(),
            _ => String::new(),
        }
    }

    fn pop_n(&mut self, n: usize) -> Vec<Value> {
        let mut values = Vec::with_capacity(n);
        for _ in 0..n {
            values.push(self.pop());
        }
        values.reverse();
        values
    }

    fn ensure_layer(&mut self) {
        if self.current_layer.is_none() {
            self.current_layer = Some(AiLayer {
                name: "Default Layer".to_string(),
                visible: true,
                locked: false,
                printable: true,
                children: Vec::new(),
                color: (0, 0, 0),
            });
        }
    }

    fn add_object(&mut self, obj: AiObject) {
        if self.in_setup {
            return;
        }
        self.object_count += 1;
        if self.object_count > MAX_DOCUMENT_OBJECTS {
            return;
        }
        if self.current_compound.is_some()
            && let AiObject::Path(p) = obj {
                if let Some(ref mut cp) = self.current_compound {
                    cp.subpaths.push(p);
                }
                return;
            }
        if let Some(ref mut group) = self.current_group {
            group.children.push(obj);
        } else {
            self.ensure_layer();
            if let Some(ref mut layer) = self.current_layer {
                layer.children.push(obj);
            }
        }
    }

    fn current_point(&self) -> Point {
        for seg in self.current_segments.iter().rev() {
            if let Some(p) = seg.points.last() {
                return *p;
            }
        }
        Point { x: 0.0, y: 0.0 }
    }

    fn is_white_fill(fill: &Option<Color>) -> bool {
        match fill {
            None => false,
            Some(Color::Spot(s)) => s.name == "White",
            Some(Color::Cmyk(c)) => c.cyan == 0.0 && c.magenta == 0.0 && c.yellow == 0.0 && c.black == 0.0,
            Some(Color::Gray(g)) => g.gray >= 1.0,
            Some(Color::Rgb(r)) => r.red >= 1.0 && r.green >= 1.0 && r.blue >= 1.0,
            Some(Color::Gradient(_)) => false,
        }
    }

    fn strip_knockout_fills(group: &mut AiGroup) {
        if group.children.len() < 2 {
            return;
        }
        let first = &group.children[0];
        let has_knockout = match first {
            AiObject::Path(p) => Self::is_white_fill(&p.fill),
            AiObject::CompoundPath(c) => Self::is_white_fill(&c.fill),
            _ => false,
        };
        if !has_knockout {
            return;
        }
        let has_colored = group.children[1..].iter().any(|child| match child {
            AiObject::Path(p) => p.fill.is_some() && !Self::is_white_fill(&p.fill),
            AiObject::CompoundPath(c) => c.fill.is_some() && !Self::is_white_fill(&c.fill),
            AiObject::Group(g) => g.children.iter().any(|sub| match sub {
                AiObject::Path(sp) => sp.fill.is_some() && !Self::is_white_fill(&sp.fill),
                AiObject::CompoundPath(sc) => sc.fill.is_some() && !Self::is_white_fill(&sc.fill),
                _ => false,
            }),
            _ => false,
        });
        if has_colored {
            group.children.remove(0);
        }
    }

    fn resolve_spot_name(&self, name: &str, c: f64, m: f64, y: f64, k: f64) -> String {
        let is_numeric = name.parse::<f64>().is_ok();
        if is_numeric {
            let cmyk = (
                (c * 1000.0) as i32,
                (m * 1000.0) as i32,
                (y * 1000.0) as i32,
                (k * 1000.0) as i32,
            );
            if let Some(real_name) = self.custom_colors.get(&cmyk) {
                return real_name.clone();
            }
        }
        name.to_string()
    }

    fn pop_spot_color_args(&mut self) -> (String, f64, f64, f64, f64, f64) {
        let vals = self.pop_n(6);
        let (c, m, y, k, name, tint) = if vals.len() >= 6 {
            match (&vals[4], &vals[0]) {
                (Value::String(_), _) | (Value::Name(_), _) => {
                    let c = vals[0].as_number();
                    let m = vals[1].as_number();
                    let y = vals[2].as_number();
                    let k = vals[3].as_number();
                    let name = vals[4].as_string();
                    let tint = vals[5].as_number();
                    (c, m, y, k, name, tint)
                }
                (_, Value::String(_)) | (_, Value::Name(_)) => {
                    let name = vals[0].as_string();
                    let c = vals[1].as_number();
                    let m = vals[2].as_number();
                    let y = vals[3].as_number();
                    let k = vals[4].as_number();
                    let tint = vals[5].as_number();
                    (c, m, y, k, name, tint)
                }
                _ => {
                    let c = vals[0].as_number();
                    let m = vals[1].as_number();
                    let y = vals[2].as_number();
                    let k = vals[3].as_number();
                    let name = vals[4].as_string();
                    let tint = vals[5].as_number();
                    (c, m, y, k, name, tint)
                }
            }
        } else {
            (0.0, 0.0, 0.0, 0.0, String::new(), 0.0)
        };
        (name, c, m, y, k, tint)
    }

    fn handle_moveto(&mut self) {
        let y = self.pop_float();
        let x = self.pop_float();
        self.current_segments.push(PathSegment {
            seg_type: SegmentType::Moveto,
            points: vec![Point { x, y }],
            smooth: false,
        });
    }

    fn handle_lineto(&mut self, op: &str) {
        let y = self.pop_float();
        let x = self.pop_float();
        let smooth = op == "l";
        self.current_segments.push(PathSegment {
            seg_type: SegmentType::Lineto,
            points: vec![Point { x, y }],
            smooth,
        });
    }

    fn handle_curveto(&mut self, op: &str) {
        let y3 = self.pop_float();
        let x3 = self.pop_float();
        let y2 = self.pop_float();
        let x2 = self.pop_float();
        let y1 = self.pop_float();
        let x1 = self.pop_float();
        let smooth = op == "c";
        self.current_segments.push(PathSegment {
            seg_type: SegmentType::Curveto,
            points: vec![Point { x: x1, y: y1 }, Point { x: x2, y: y2 }, Point { x: x3, y: y3 }],
            smooth,
        });
    }

    fn handle_curveto_v(&mut self, op: &str) {
        let y3 = self.pop_float();
        let x3 = self.pop_float();
        let y2 = self.pop_float();
        let x2 = self.pop_float();
        let cp = self.current_point();
        let smooth = op == "v";
        self.current_segments.push(PathSegment {
            seg_type: SegmentType::Curveto,
            points: vec![Point { x: cp.x, y: cp.y }, Point { x: x2, y: y2 }, Point { x: x3, y: y3 }],
            smooth,
        });
    }

    fn handle_curveto_y(&mut self, op: &str) {
        let y2 = self.pop_float();
        let x2 = self.pop_float();
        let y1 = self.pop_float();
        let x1 = self.pop_float();
        let smooth = op == "y";
        self.current_segments.push(PathSegment {
            seg_type: SegmentType::Curveto,
            points: vec![Point { x: x1, y: y1 }, Point { x: x2, y: y2 }, Point { x: x2, y: y2 }],
            smooth,
        });
    }

    fn handle_closepath(&mut self) {
        self.current_segments.push(PathSegment {
            seg_type: SegmentType::Closepath,
            points: vec![],
            smooth: false,
        });
    }

    fn handle_render(&mut self, op: &str) {
        if self.current_segments.is_empty() {
            return;
        }

        let is_closed = matches!(op, "n" | "f" | "s" | "b");
        let has_fill = matches!(op, "F" | "f" | "B" | "b");
        let has_stroke = matches!(op, "S" | "s" | "B" | "b");
        let is_noop = matches!(op, "N" | "n");

        if is_closed
            && let Some(last) = self.current_segments.last()
                && last.seg_type != SegmentType::Closepath {
                    self.current_segments.push(PathSegment {
                        seg_type: SegmentType::Closepath,
                        points: vec![],
                        smooth: false,
                    });
                }

        let path = AiPath {
            segments: self.current_segments.clone(),
            fill: if has_fill { self.graphics_state.fill.clone() } else { None },
            stroke: if has_stroke { self.graphics_state.stroke.clone() } else { None },
            stroke_width: self.graphics_state.stroke_width,
            line_cap: self.graphics_state.line_cap,
            line_join: self.graphics_state.line_join,
            miter_limit: self.graphics_state.miter_limit,
            dash: self.graphics_state.dash.clone(),
            closed: is_closed,
            clip: self.graphics_state.clip,
            opacity: self.graphics_state.opacity,
            name: None,
        };

        if !is_noop {
            self.add_object(AiObject::Path(path));
        }

        self.current_segments.clear();
        self.graphics_state.clip = false;
    }

    fn handle_gray_fill(&mut self) {
        let g = self.pop_float();
        self.graphics_state.fill = Some(Color::Gray(GrayColor { gray: g }));
    }

    fn handle_gray_stroke(&mut self) {
        let g = self.pop_float();
        self.graphics_state.stroke = Some(Color::Gray(GrayColor { gray: g }));
    }

    fn handle_cmyk_fill(&mut self) {
        let k = self.pop_float();
        let y = self.pop_float();
        let m = self.pop_float();
        let c = self.pop_float();
        self.graphics_state.fill = Some(Color::Cmyk(CmykColor { cyan: c, magenta: m, yellow: y, black: k }));
    }

    fn handle_cmyk_stroke(&mut self) {
        let k = self.pop_float();
        let y = self.pop_float();
        let m = self.pop_float();
        let c = self.pop_float();
        self.graphics_state.stroke = Some(Color::Cmyk(CmykColor { cyan: c, magenta: m, yellow: y, black: k }));
    }

    fn handle_rgb_fill(&mut self) {
        let b = self.pop_float();
        let g = self.pop_float();
        let r = self.pop_float();
        self.graphics_state.fill = Some(Color::Rgb(RgbColor { red: r, green: g, blue: b }));
    }

    fn handle_rgb_stroke(&mut self) {
        let b = self.pop_float();
        let g = self.pop_float();
        let r = self.pop_float();
        self.graphics_state.stroke = Some(Color::Rgb(RgbColor { red: r, green: g, blue: b }));
    }

    fn handle_spot_fill(&mut self) {
        let (name, c, m, y, k, tint) = self.pop_spot_color_args();
        let name = self.resolve_spot_name(&name, c, m, y, k);
        let spot = SpotColor {
            name: name.clone(),
            cyan: c,
            magenta: m,
            yellow: y,
            black: k,
            tint: 1.0 - tint,
        };
        self.graphics_state.fill = Some(Color::Spot(spot));
        if !self.spot_colors.iter().any(|s| s.name == name) {
            self.spot_colors.push(SpotColor {
                name,
                cyan: c,
                magenta: m,
                yellow: y,
                black: k,
                tint: 1.0,
            });
        }
    }

    fn handle_spot_stroke(&mut self) {
        let (name, c, m, y, k, tint) = self.pop_spot_color_args();
        let name = self.resolve_spot_name(&name, c, m, y, k);
        let spot = SpotColor {
            name: name.clone(),
            cyan: c,
            magenta: m,
            yellow: y,
            black: k,
            tint: 1.0 - tint,
        };
        self.graphics_state.stroke = Some(Color::Spot(spot));
        if !self.spot_colors.iter().any(|s| s.name == name) {
            self.spot_colors.push(SpotColor {
                name,
                cyan: c,
                magenta: m,
                yellow: y,
                black: k,
                tint: 1.0,
            });
        }
    }

    fn handle_custom_fill(&mut self) {
        self.stack.clear();
    }

    fn handle_custom_stroke(&mut self) {
        self.stack.clear();
    }

    fn handle_line_width(&mut self) {
        self.graphics_state.stroke_width = self.pop_float();
    }

    fn handle_line_cap(&mut self) {
        self.graphics_state.line_cap = self.pop_int() as u8;
    }

    fn handle_line_join(&mut self) {
        self.graphics_state.line_join = self.pop_int() as u8;
    }

    fn handle_miter_limit(&mut self) {
        self.graphics_state.miter_limit = self.pop_float();
    }

    fn handle_dash(&mut self) {
        let offset = self.pop_float();
        match self.pop() {
            Value::Array(arr) => {
                let dash: Vec<f64> = arr.iter().map(|v| v.as_number()).collect();
                self.graphics_state.dash = Some((dash, offset));
            }
            _ => {
                self.graphics_state.dash = None;
            }
        }
    }

    fn handle_gsave(&mut self) {
        if self.state_stack.len() >= MAX_STATE_STACK {
            return;
        }
        self.state_stack.push(self.graphics_state.clone());
    }

    fn handle_grestore(&mut self) {
        if let Some(state) = self.state_stack.pop() {
            self.graphics_state = state;
        }
    }

    fn handle_clip(&mut self) {
        self.graphics_state.clip = true;
    }

    fn handle_concat_matrix(&mut self) {
        let f = self.pop_float();
        let e = self.pop_float();
        let d = self.pop_float();
        let c = self.pop_float();
        let b = self.pop_float();
        let a = self.pop_float();
        let new_matrix = Matrix { a, b, c, d, e, f };
        self.graphics_state.transform = self.graphics_state.transform.concat(&new_matrix);
    }

    fn handle_begin_group(&mut self) {
        if self.nesting.len() >= MAX_NESTING_DEPTH {
            return;
        }
        let mut group = AiGroup {
            children: Vec::new(),
            name: None,
            clipped: false,
            opacity: 1.0,
        };
        if self.graphics_state.clip {
            group.clipped = true;
            self.graphics_state.clip = false;
        }
        let prev = self.current_group.take();
        self.nesting.push(prev.unwrap_or(AiGroup {
            children: Vec::new(),
            name: None,
            clipped: false,
            opacity: 1.0,
        }));
        self.current_group = Some(group);
    }

    fn handle_end_group(&mut self) {
        if let Some(mut group) = self.current_group.take() {
            Self::strip_knockout_fills(&mut group);
            self.current_group = self.nesting.pop();
            self.add_object(AiObject::Group(group));
        }
    }

    fn handle_begin_compound(&mut self) {
        self.current_compound = Some(AiCompoundPath {
            subpaths: Vec::new(),
            fill: None,
            stroke: None,
            stroke_width: 1.0,
            name: None,
        });
    }

    fn handle_end_compound(&mut self) {
        if let Some(mut compound) = self.current_compound.take() {
            if !compound.subpaths.is_empty() {
                if compound.fill.is_none() {
                    compound.fill = compound.subpaths[0].fill.clone();
                }
                if compound.stroke.is_none() {
                    compound.stroke = compound.subpaths[0].stroke.clone();
                    compound.stroke_width = compound.subpaths[0].stroke_width;
                }
            }
            self.add_object(AiObject::CompoundPath(compound));
        }
    }

    fn handle_begin_layer(&mut self) {
        let args: Vec<Value> = self.stack.drain(..).collect();
        self.stack.clear();

        if let Some(ref layer) = self.current_layer
            && !self.document.layers.iter().any(|l| l.name == layer.name) {
                self.document.layers.push(layer.clone());
            }

        let mut layer = AiLayer {
            name: "Layer".to_string(),
            visible: true,
            locked: false,
            printable: true,
            children: Vec::new(),
            color: (0, 0, 0),
        };

        if args.len() >= 4 {
            layer.visible = args[0].as_bool();
            layer.locked = !args[2].as_bool();
            layer.printable = args[3].as_bool();
        }

        if args.len() >= 11 {
            let r = args[8].as_number();
            let g = args[9].as_number();
            let b = args[10].as_number();
            layer.color = (
                (r as i32).clamp(0, 255) as u8,
                (g as i32).clamp(0, 255) as u8,
                (b as i32).clamp(0, 255) as u8,
            );
        }

        self.current_layer = Some(layer);
    }

    fn handle_end_layer(&mut self) {
        if let Some(layer) = self.current_layer.take()
            && !self.document.layers.iter().any(|l| l.name == layer.name) {
                self.document.layers.push(layer);
            }
    }

    fn handle_layer_name(&mut self) {
        let name = self.pop_str();
        if let Some(ref mut layer) = self.current_layer {
            layer.name = name;
        }
    }

    fn handle_begin_text(&mut self) {
        let text_type = self.pop_int() as u8;
        self.in_text = true;
        self.current_text = Some(AiText {
            content: String::new(),
            font: self.text_font.clone(),
            size: self.text_size,
            transform: self.text_transform.clone(),
            fill: None,
            stroke: None,
            text_type,
            name: None,
        });
    }

    fn handle_end_text(&mut self) {
        if let Some(mut text) = self.current_text.take() {
            text.font = self.text_font.clone();
            text.size = self.text_size;
            text.transform = self.text_transform.clone();
            text.fill = self.graphics_state.fill.clone();
            text.stroke = self.graphics_state.stroke.clone();
            self.add_object(AiObject::Text(text));
        }
        self.in_text = false;
    }

    fn handle_text_path(&mut self) {
        let ty = self.pop_float();
        let tx = self.pop_float();
        let d = self.pop_float();
        let c = self.pop_float();
        let b = self.pop_float();
        let a = self.pop_float();
        self.text_transform = Matrix { a, b, c, d, e: tx, f: ty };
    }

    fn handle_end_text_path(&mut self) {}

    fn handle_text_render(&mut self) {
        let text = self.pop_str();
        if let Some(ref mut t) = self.current_text {
            t.content += &text;
        }
    }

    fn handle_text_font(&mut self) {
        let size = self.pop_float();
        let font = self.pop_str();
        self.text_font = font.clone();
        self.text_size = size;
        if !font.is_empty() && !self.fonts_used.contains(&font) {
            self.fonts_used.push(font);
        }
    }

    fn handle_begin_gradient(&mut self) {
        self.current_gradient_type = self.pop_int() as u8;
    }

    fn handle_end_gradient(&mut self) {}

    fn handle_begin_gradient_def(&mut self) {
        self.in_gradient_def = true;
        self.current_gradient_stops.clear();
    }

    fn handle_end_gradient_def(&mut self) {
        self.in_gradient_def = false;
        if !self.current_gradient_name.is_empty() {
            let gradient = GradientColor {
                name: self.current_gradient_name.clone(),
                gradient_type: self.current_gradient_type,
                stops: self.current_gradient_stops.clone(),
                transform: Matrix::identity(),
                origin: (0.0, 0.0),
                angle: 0.0,
                length: 0.0,
                hilite_angle: 0.0,
                hilite_length: 0.0,
            };
            self.gradient_defs.insert(self.current_gradient_name.clone(), gradient);
        }
    }

    fn handle_gradient_stop(&mut self) {
        let args: Vec<Value> = self.stack.drain(..).collect();
        self.stack.clear();

        if args.len() >= 6 {
            let midpoint = args[0].as_number();
            if args.len() >= 7 {
                let c = args[2].as_number();
                let m = args[3].as_number();
                let y = args[4].as_number();
                let k = args[5].as_number();
                let color = Color::Cmyk(CmykColor { cyan: c, magenta: m, yellow: y, black: k });
                let offset = midpoint / 100.0;
                self.current_gradient_stops.push(GradientStop {
                    offset,
                    color: Box::new(color),
                    midpoint: 0.5,
                });
            }
        }
    }

    fn handle_gradient_geometry(&mut self) {
        self.stack.clear();
    }

    fn handle_raster_image(&mut self) {
        let args: Vec<Value> = self.stack.drain(..).collect();
        self.stack.clear();

        let mut image = AiImage {
            width: 0,
            height: 0,
            bits_per_component: 8,
            color_space: "RGB".to_string(),
            data: Vec::new(),
            transform: Matrix::identity(),
            name: None,
        };

        for (i, arg) in args.iter().enumerate() {
            if let Value::Number(n) = arg {
                match i {
                    0 => image.width = *n as u32,
                    1 => image.height = *n as u32,
                    _ => {}
                }
            }
        }

        self.add_object(AiObject::Image(image));
    }

    fn handle_pop(&mut self) {
        self.pop();
    }

    fn handle_null(&mut self) {
        self.push_stack(Value::Null);
    }

    fn handle_true(&mut self) {
        self.push_stack(Value::Boolean(true));
    }

    fn handle_false(&mut self) {
        self.push_stack(Value::Boolean(false));
    }

    fn handle_dup(&mut self) {
        if let Some(last) = self.stack.last().cloned() {
            self.push_stack(last);
        }
    }

    fn handle_exch(&mut self) {
        if self.stack.len() >= 2 {
            let len = self.stack.len();
            self.stack.swap(len - 1, len - 2);
        }
    }

    fn handle_appearance_style(&mut self) {
        self.pop_int();
    }

    fn handle_appearance_end(&mut self) {
        self.pop_int();
    }

    fn handle_noop(&mut self, op_name: &str) {
        if let Some(op_def) = get_operator(op_name)
            && let Some(count) = op_def.arg_count
                && count > 0 {
                    self.pop_n(count);
                }
    }

    fn handle_comment(&mut self, text: &str) {
        if text.starts_with("%%BeginProlog") || text.starts_with("%%BeginSetup") {
            self.in_setup = true;
            return;
        }
        if text.starts_with("%%EndSetup") {
            self.in_setup = false;
            self.stack.clear();
            self.current_group = None;
            self.current_compound = None;
            self.nesting.clear();
            self.current_segments.clear();
            return;
        }
        if text.starts_with("%%BoundingBox:") {
            self.parse_bounding_box(text);
        } else if let Some(title) = text.strip_prefix("%%Title:") {
            self.document.title = title.trim().trim_matches(|c| c == '(' || c == ')').to_string();
        } else if let Some(creator) = text.strip_prefix("%%Creator:") {
            self.document.creator = creator.trim().to_string();
        } else if text.starts_with("%AI5_FileFormat") {
            if let Some(version_str) = text.split_whitespace().nth(1) {
                self.document.version = format!("AI {}", version_str);
            }
        } else if text.starts_with("%%CMYKCustomColor:") || text.starts_with("%%+ ") {
            self.parse_custom_color(text);
        } else if text.starts_with("%%DocumentCustomColors:") {
        } else if let Some(colors_part) = text.strip_prefix("%%DocumentProcessColors:") {
            if colors_part.contains("Cyan") {
                self.document.color_mode = "CMYK".to_string();
            } else if colors_part.contains("Red") {
                self.document.color_mode = "RGB".to_string();
            }
        }
    }

    fn handle_pseudo_comment(&mut self, text: &str) {
        if text.starts_with("%AI5_BeginLayer") {
            self.in_setup = false;
            self.stack.clear();
            self.current_group = None;
            self.current_compound = None;
            self.nesting.clear();
            self.current_segments.clear();
            return;
        }
        if let Some(suffix) = text.strip_prefix("%AI5_FileFormat") {
            if let Some(version_str) = suffix.split_whitespace().next() {
                self.document.version = format!("AI {}", version_str);
            }
            return;
        }
        if text.starts_with("%AI8_CreatorVersion:") {
            if let Some(val) = text.split(':').nth(1) {
                self.metadata.insert("creator_version".to_string(), val.trim().to_string());
            }
            return;
        }
        if text.starts_with("%AI5_NumLayers:") {
            return;
        }
        if text.starts_with("%AI9_ColorModel:") {
            if let Some(val) = text.split(':').nth(1) {
                let model = val.trim();
                if model == "2" {
                    self.document.color_mode = "CMYK".to_string();
                } else if model == "1" {
                    self.document.color_mode = "RGB".to_string();
                }
            }
            return;
        }

        if let Some(body) = text.strip_prefix("%_") {
            let parts: Vec<&str> = body.split_whitespace().collect();
            if parts.is_empty() {
                return;
            }
            let op = parts[0];
            match op {
                "Bs" | "BS"
                    if parts.len() >= 7 => {
                        let offset: f64 = parts[1].parse().unwrap_or(0.0);
                        let c: f64 = parts[3].parse().unwrap_or(0.0);
                        let m: f64 = parts[4].parse().unwrap_or(0.0);
                        let y: f64 = parts[5].parse().unwrap_or(0.0);
                        let k: f64 = parts[6].parse().unwrap_or(0.0);
                        let color = Color::Cmyk(CmykColor { cyan: c, magenta: m, yellow: y, black: k });
                        self.current_gradient_stops.push(GradientStop {
                            offset: offset / 100.0,
                            color: Box::new(color),
                            midpoint: 0.5,
                        });
                    }
                "Bd"
                    if parts.len() >= 2 => {
                        let name = parts[1].trim_matches(|c| c == '(' || c == ')');
                        self.current_gradient_name = name.to_string();
                        self.in_gradient_def = true;
                        self.current_gradient_stops.clear();
                    }
                "BD" => {
                    self.handle_end_gradient_def();
                }
                _ => {}
            }
        }
    }

    fn parse_bounding_box(&mut self, text: &str) {
        let parts: Vec<&str> = text.split_whitespace().collect();
        if parts.len() >= 5 {
            let llx: f64 = parts[1].parse().unwrap_or(0.0);
            let lly: f64 = parts[2].parse().unwrap_or(0.0);
            let urx: f64 = parts[3].parse().unwrap_or(0.0);
            let ury: f64 = parts[4].parse().unwrap_or(0.0);
            self.document.bounding_box = Some(BoundingBox {
                x: llx,
                y: lly,
                width: urx - llx,
                height: ury - lly,
            });
        }
    }

    fn parse_custom_color(&mut self, text: &str) {
        let body = if let Some(body) = text.strip_prefix("%%CMYKCustomColor:") {
            body.trim().to_string()
        } else if let Some(body) = text.strip_prefix("%%+ ") {
            body.trim().to_string()
        } else {
            return;
        };

        let mut remaining = body.as_str();
        while !remaining.is_empty() {
            let trimmed = remaining.trim_start();
            let mut parts = trimmed.splitn(5, |c: char| c.is_whitespace());
            let c_str = parts.next();
            let m_str = parts.next();
            let y_str = parts.next();
            let k_str = parts.next();
            let rest = parts.next().unwrap_or("");

            if let (Some(cs), Some(ms), Some(ys), Some(ks)) = (c_str, m_str, y_str, k_str) {
                let c: f64 = cs.parse().unwrap_or(0.0);
                let m: f64 = ms.parse().unwrap_or(0.0);
                let y: f64 = ys.parse().unwrap_or(0.0);
                let k: f64 = ks.parse().unwrap_or(0.0);

                if let Some(paren_start) = rest.find('(')
                    && let Some(paren_end) = rest[paren_start..].find(')') {
                        let name = rest[paren_start + 1..paren_start + paren_end].to_string();
                        let key = (
                            (c * 1000.0) as i32,
                            (m * 1000.0) as i32,
                            (y * 1000.0) as i32,
                            (k * 1000.0) as i32,
                        );
                        self.custom_colors.insert(key, name);
                        let after_paren = paren_start + paren_end + 1;
                        remaining = &rest[after_paren..];
                        continue;
                    }
            }
            break;
        }
    }
}

impl Default for AiParser {
    fn default() -> Self {
        Self::new()
    }
}

trait AsValue {
    fn as_number(&self) -> f64;
    fn as_string(&self) -> String;
    fn as_bool(&self) -> bool;
}

impl AsValue for Value {
    fn as_number(&self) -> f64 {
        match self {
            Value::Number(n) => *n,
            Value::String(s) => s.parse().unwrap_or(0.0),
            Value::Name(s) => s.parse().unwrap_or(0.0),
            _ => 0.0,
        }
    }

    fn as_string(&self) -> String {
        match self {
            Value::String(s) => s.clone(),
            Value::Name(s) => s.clone(),
            Value::Number(n) => n.to_string(),
            Value::Boolean(b) => b.to_string(),
            _ => String::new(),
        }
    }

    fn as_bool(&self) -> bool {
        match self {
            Value::Boolean(b) => *b,
            Value::Number(n) => *n != 0.0,
            Value::String(s) => !s.is_empty(),
            _ => false,
        }
    }
}

pub fn parse_ai(tokens: Vec<Token>) -> Result<AiDocument> {
    let mut parser = AiParser::new();
    parser.parse(tokens)
}
