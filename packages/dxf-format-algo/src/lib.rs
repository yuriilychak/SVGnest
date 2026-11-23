//! ASCII DXF to SVGnest's shared SVG format core.

use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Default)]
struct Entity { kind: String, values: HashMap<i32, Vec<String>> }

#[wasm_bindgen]
pub fn input_to_svg(input: &[u8]) -> Result<String, JsValue> {
    input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn input_to_polygons(input: &[u8], tolerance: f64) -> Result<String, JsValue> {
    let svg = input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))?;
    svg_format_algo::core_input_to_polygons(svg.as_bytes(), tolerance).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn output_to_svg(input: &[u8], placement_data: &[u8]) -> Result<String, JsValue> {
    let svg = input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))?;
    svg_format_algo::core_output_to_svg(svg.as_bytes(), placement_data).map_err(|error| JsValue::from_str(&error))
}

fn input_to_svg_core(input: &[u8]) -> Result<String, String> {
    let source = std::str::from_utf8(input).map_err(|_| "DXF must be UTF-8 compatible ASCII text; binary DXF is not supported.".to_owned())?;
    if source.trim_start_matches('\u{feff}').starts_with("AutoCAD Binary DXF") {
        return Err("Binary DXF files are not supported. Export the drawing as an ASCII DXF file.".into());
    }
    let entities = entities(source)?;
    let paths: Vec<String> = entities.iter().filter_map(entity_path).collect();
    if paths.is_empty() { return Err("The DXF file contains no supported geometry in its ENTITIES section.".into()); }
    Ok(format!("<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" stroke=\"black\">{}</svg>", paths.into_iter().map(|path| format!("<path d=\"{path}\"/>" )).collect::<String>()))
}

fn entities(source: &str) -> Result<Vec<Entity>, String> {
    let lines: Vec<&str> = source.trim_start_matches('\u{feff}').lines().collect();
    if lines.len() % 2 != 0 { return Err("Invalid ASCII DXF: group-code/value pairs are incomplete.".into()); }
    let mut pairs = Vec::with_capacity(lines.len() / 2);
    for (index, pair) in lines.chunks(2).enumerate() {
        let code = pair[0].trim().parse::<i32>().map_err(|_| format!("Invalid DXF group code at line {}.", index * 2 + 1))?;
        pairs.push((code, pair[1].trim()));
    }
    let start = pairs.windows(2).position(|window| window[0] == (0, "SECTION") && window[1] == (2, "ENTITIES"))
        .ok_or("Invalid DXF: missing ENTITIES section.")? + 2;
    let mut output = Vec::new();
    let mut current: Option<Entity> = None;
    for (code, value) in pairs.into_iter().skip(start) {
        if code == 0 && value == "ENDSEC" { break; }
        if code == 0 {
            if let Some(entity) = current.take() { output.push(entity); }
            current = Some(Entity { kind: value.to_ascii_uppercase(), ..Default::default() });
        } else if let Some(entity) = current.as_mut() {
            entity.values.entry(code).or_default().push(value.to_owned());
        }
    }
    if let Some(entity) = current { output.push(entity); }
    Ok(merge_polylines(output))
}

fn merge_polylines(records: Vec<Entity>) -> Vec<Entity> {
    let mut output = Vec::new(); let mut index = 0;
    while index < records.len() {
        let mut record = records[index].clone_entity();
        if record.kind != "POLYLINE" {
            if record.kind != "VERTEX" && record.kind != "SEQEND" { output.push(record); }
            index += 1; continue;
        }
        let mut xs = Vec::new(); let mut ys = Vec::new(); index += 1;
        while let Some(vertex) = records.get(index).filter(|value| value.kind == "VERTEX") {
            if let Some((x, y)) = xy(vertex, 0) { xs.push(x.to_string()); ys.push(y.to_string()); }
            index += 1;
        }
        if records.get(index).is_some_and(|value| value.kind == "SEQEND") { index += 1; }
        record.values.insert(10, xs); record.values.insert(20, ys); output.push(record);
    }
    output
}

impl Entity { fn clone_entity(&self) -> Self { Self { kind: self.kind.clone(), values: self.values.clone() } } }

fn entity_path(entity: &Entity) -> Option<String> {
    match entity.kind.as_str() {
        "LINE" => Some(format!("M {} L {}", point(xy(entity, 0)?), point(xy(entity, 1)?))),
        "LWPOLYLINE" | "POLYLINE" => polyline(entity),
        "CIRCLE" => { let center = xy(entity, 0)?; let radius = number(entity, 40)?; (radius > 0.0).then(|| format!("M {} {} A {} {} 0 1 0 {} {} A {} {} 0 1 0 {} {} Z", f(center.0 + radius), f(-center.1), f(radius), f(radius), f(center.0 - radius), f(-center.1), f(radius), f(radius), f(center.0 + radius), f(-center.1))) }
        "ARC" => arc(entity),
        "ELLIPSE" => ellipse(entity),
        _ => None,
    }
}

fn polyline(entity: &Entity) -> Option<String> {
    let xs = entity.values.get(&10)?; let ys = entity.values.get(&20)?;
    let points: Vec<(f64, f64)> = xs.iter().zip(ys).filter_map(|(x, y)| Some((x.parse().ok()?, y.parse().ok()?))).collect();
    if points.len() < 2 { return None; }
    let closed = (number(entity, 70).unwrap_or(0.0) as i32 & 1) != 0;
    Some(format!("M {}{}{}", point(points[0]), points[1..].iter().map(|vertex| format!(" L {}", point(*vertex))).collect::<String>(), if closed { " Z" } else { "" }))
}

fn arc(entity: &Entity) -> Option<String> {
    let center = xy(entity, 0)?; let radius = number(entity, 40)?; let start = number(entity, 50)?; let end = number(entity, 51)?;
    if radius <= 0.0 { return None; }
    let sweep = (end - start).rem_euclid(360.0); if sweep == 0.0 { return None; }
    let at = |degrees: f64| (center.0 + radius * degrees.to_radians().cos(), center.1 + radius * degrees.to_radians().sin());
    Some(format!("M {} A {} {} 0 {} 0 {}", point(at(start)), f(radius), f(radius), if sweep > 180.0 { 1 } else { 0 }, point(at(end))))
}

fn ellipse(entity: &Entity) -> Option<String> {
    let center = xy(entity, 0)?; let major_x = number(entity, 11)?; let major_y = number(entity, 21)?; let ratio = number(entity, 40)?;
    let rx = major_x.hypot(major_y); let ry = rx * ratio; if rx == 0.0 || ry <= 0.0 { return None; }
    let rotation = -major_y.atan2(major_x).to_degrees();
    Some(format!("M {} {} A {} {} {} 1 0 {} {} A {} {} {} 1 0 {} {} Z", f(center.0 + major_x), f(-center.1 - major_y), f(rx), f(ry), f(rotation), f(center.0 - major_x), f(-center.1 + major_y), f(rx), f(ry), f(rotation), f(center.0 + major_x), f(-center.1 - major_y)))
}

fn xy(entity: &Entity, offset: i32) -> Option<(f64, f64)> { Some((number(entity, 10 + offset)?, number(entity, 20 + offset)?)) }
fn number(entity: &Entity, code: i32) -> Option<f64> { entity.values.get(&code)?.first()?.parse().ok().filter(|value: &f64| value.is_finite()) }
fn point((x, y): (f64, f64)) -> String { format!("{} {}", f(x), f(-y)) }
fn f(value: f64) -> String { let value = if value == -0.0 { 0.0 } else { value }; format!("{value:.8}").trim_end_matches('0').trim_end_matches('.').to_owned() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn converts_closed_polyline_to_svg() {
        let dxf = "0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n70\n1\n10\n0\n20\n0\n10\n10\n20\n0\n10\n10\n20\n10\n0\nENDSEC\n0\nEOF\n";
        let svg = input_to_svg_core(dxf.as_bytes()).expect("valid DXF");
        assert!(svg.contains("M 0 0 L 10 0 L 10 -10 Z"));
    }
    #[test]
    fn rejects_binary_dxf() { assert!(input_to_svg_core(b"AutoCAD Binary DXF\0").is_err()); }
}
