use crate::error::{Error, Result};
use crate::model::*;
use serde_json::{json, Value};

pub fn export_json(document: &AiDocument) -> Result<String> {
    let bbox = document.bounding_box.as_ref().map(|b| json!([b.x, b.y, b.width, b.height]));

    let spot_colors: Vec<Value> = document
        .spot_colors
        .iter()
        .map(|sc| {
            json!({
                "name": sc.name,
                "cmyk": [sc.cyan, sc.magenta, sc.yellow, sc.black],
                "rgb_hex": sc.to_hex(),
            })
        })
        .collect();

    let layers: Vec<Value> = document
        .layers
        .iter()
        .map(|layer| {
            let objects: Vec<Value> =
                layer.children.iter().filter_map(serialize_object).collect();
            json!({
                "name": layer.name,
                "visible": layer.visible,
                "locked": layer.locked,
                "printable": layer.printable,
                "objects": objects,
            })
        })
        .collect();

    let data = json!({
        "version": document.version,
        "title": document.title,
        "creator": document.creator,
        "color_mode": document.color_mode,
        "bounding_box": bbox,
        "fonts_used": document.fonts_used,
        "spot_colors": spot_colors,
        "layers": layers,
    });

    serde_json::to_string_pretty(&data).map_err(|e| Error::Export(e.to_string()))
}

fn serialize_object(obj: &AiObject) -> Option<Value> {
    match obj {
        AiObject::Path(p) => Some(serialize_path(p)),
        AiObject::Group(g) => {
            let children: Vec<Value> =
                g.children.iter().filter_map(serialize_object).collect();
            let mut result = json!({
                "type": "group",
                "children": children,
            });
            if let Some(ref name) = g.name {
                result["name"] = json!(name);
            }
            if g.clipped {
                result["clipped"] = json!(true);
            }
            Some(result)
        }
        AiObject::CompoundPath(c) => {
            let subpaths: Vec<Value> = c.subpaths.iter().map(serialize_path).collect();
            Some(json!({
                "type": "compound_path",
                "fill": serialize_color(&c.fill),
                "stroke": serialize_color(&c.stroke),
                "subpaths": subpaths,
            }))
        }
        AiObject::Text(t) => {
            let text_type = match t.text_type {
                0 => "point",
                1 => "area",
                2 => "path",
                _ => "unknown",
            };
            Some(json!({
                "type": "text",
                "content": t.content,
                "font": t.font,
                "size": t.size,
                "fill": serialize_color(&t.fill),
                "text_type": text_type,
            }))
        }
        AiObject::Image(img) => Some(json!({
            "type": "image",
            "width": img.width,
            "height": img.height,
            "color_space": img.color_space,
            "bits_per_component": img.bits_per_component,
            "has_data": !img.data.is_empty(),
        })),
    }
}

fn serialize_path(p: &AiPath) -> Value {
    let bbox = p.bounding_box();
    let mut result = json!({
        "type": "path",
        "fill": serialize_color(&p.fill),
        "stroke": serialize_color(&p.stroke),
        "stroke_width": p.stroke_width,
        "closed": p.closed,
        "segments": serialize_segments(&p.segments),
    });
    if let Some(b) = bbox {
        result["bounds"] = json!([b.x, b.y, b.width, b.height]);
    }
    if let Some(ref name) = p.name {
        result["name"] = json!(name);
    }
    if let Some(ref dash) = p.dash {
        result["dash"] = json!({
            "array": dash.0,
            "offset": dash.1,
        });
    }
    result
}

fn serialize_color(color: &Option<Color>) -> Value {
    match color {
        None => Value::Null,
        Some(c) => serialize_color_value(c),
    }
}

fn serialize_color_value(color: &Color) -> Value {
    match color {
        Color::Spot(sc) => json!({
            "type": "spot",
            "name": sc.name,
            "cmyk": [sc.cyan, sc.magenta, sc.yellow, sc.black],
            "tint": sc.tint,
            "rgb_hex": sc.to_hex(),
        }),
        Color::Cmyk(c) => json!({
            "type": "cmyk",
            "cmyk": [c.cyan, c.magenta, c.yellow, c.black],
            "rgb_hex": c.to_hex(),
        }),
        Color::Rgb(c) => json!({
            "type": "rgb",
            "rgb": [c.red, c.green, c.blue],
            "rgb_hex": c.to_hex(),
        }),
        Color::Gray(c) => json!({
            "type": "gray",
            "gray": c.gray,
            "rgb_hex": c.to_hex(),
        }),
        Color::Gradient(g) => {
            let gradient_type = if g.gradient_type == 0 { "linear" } else { "radial" };
            let stops: Vec<Value> = g
                .stops
                .iter()
                .map(|s| {
                    json!({
                        "offset": s.offset,
                        "color": serialize_color_value(&s.color),
                        "midpoint": s.midpoint,
                    })
                })
                .collect();
            json!({
                "type": "gradient",
                "name": g.name,
                "gradient_type": gradient_type,
                "stops": stops,
            })
        }
    }
}

fn serialize_segments(segments: &[PathSegment]) -> Vec<Value> {
    segments
        .iter()
        .map(|seg| match seg.seg_type {
            SegmentType::Moveto | SegmentType::Lineto => {
                let op = if seg.seg_type == SegmentType::Moveto { "M" } else { "L" };
                let p = seg.points.first().copied().unwrap_or(Point { x: 0.0, y: 0.0 });
                json!({
                    "op": op,
                    "x": p.x,
                    "y": p.y,
                })
            }
            SegmentType::Curveto => {
                let default_pt = Point { x: 0.0, y: 0.0 };
                let p0 = seg.points.first().copied().unwrap_or(default_pt);
                let p1 = seg.points.get(1).copied().unwrap_or(default_pt);
                let p2 = seg.points.get(2).copied().unwrap_or(default_pt);
                json!({
                    "op": "C",
                    "x1": p0.x,
                    "y1": p0.y,
                    "x2": p1.x,
                    "y2": p1.y,
                    "x3": p2.x,
                    "y3": p2.y,
                })
            }
            SegmentType::Closepath => json!({"op": "Z"}),
        })
        .collect()
}
