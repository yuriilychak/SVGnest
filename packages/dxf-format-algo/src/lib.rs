//! ASCII DXF to SVGnest's shared SVG format core.

use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Default)]
struct Entity { kind: String, values: HashMap<i32, Vec<String>> }

struct PlacementRequest { bin_source: usize, tree: Vec<TreeNode>, sheets: Vec<Vec<Placement>> }
struct TreeNode { source: Option<usize>, children: Vec<TreeNode> }
struct Placement { id: usize, x: f64, y: f64, rotation: f64 }

#[derive(Clone, Copy)]
struct Transform { x: f64, y: f64, rotation: f64 }

impl Transform {
    fn identity() -> Self { Self { x: 0.0, y: 0.0, rotation: 0.0 } }
    fn from_placement(placement: &Placement) -> Self { Self { x: placement.x, y: placement.y, rotation: placement.rotation } }
    /// Converts an original DXF point through the SVG nesting transform and
    /// back into DXF's y-up coordinate system.
    fn point(self, (x, y): (f64, f64)) -> (f64, f64) {
        let radians = self.rotation.to_radians();
        (radians.cos() * x + radians.sin() * y + self.x, -radians.sin() * x + radians.cos() * y - self.y)
    }
}

#[wasm_bindgen]
pub fn input_to_svg(input: &[u8]) -> Result<String, JsValue> {
    input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn input_to_polygons(input: &[u8], tolerance: f64) -> Result<Vec<u8>, JsValue> {
    let svg = input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))?;
    svg_format_algo::core_input_to_polygons(svg.as_bytes(), tolerance).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn output_to_svg(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, JsValue> {
    let svg = input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))?;
    svg_format_algo::core_output_to_svg(svg.as_bytes(), placement_data).map_err(|error| JsValue::from_str(&error))
}

/// Produces a native ASCII DXF for the first nested sheet. Preview rendering
/// remains SVG, but downloads preserve the selected DXF format.
#[wasm_bindgen]
pub fn output_to_data(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, JsValue> {
    output_to_data_core(input, placement_data).map(|dxf| dxf.into_bytes()).map_err(|error| JsValue::from_str(&error))
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

fn output_to_data_core(input: &[u8], placement_data: &[u8]) -> Result<String, String> {
    let source = std::str::from_utf8(input).map_err(|_| "DXF must be UTF-8 compatible ASCII text; binary DXF is not supported.".to_owned())?;
    let sources: Vec<Entity> = entities(source)?.into_iter().filter(|entity| entity_path(entity).is_some()).collect();
    let request = decode_placement(placement_data)?;
    if request.bin_source >= sources.len() { return Err("Placement data refers to a missing DXF source.".into()); }
    let placements = request.sheets.first().ok_or("Placement data contains no output sheets.")?;
    let mut output = String::from("0\nSECTION\n2\nENTITIES\n");
    append_entity(&mut output, &sources[request.bin_source], Transform::identity());
    for placement in placements {
        let node = request.tree.get(placement.id).ok_or("Placement data refers to a missing nesting tree node.")?;
        append_node(&mut output, node, &sources, Transform::from_placement(placement));
    }
    output.push_str("0\nENDSEC\n0\nEOF\n");
    Ok(output)
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

fn append_node(output: &mut String, node: &TreeNode, sources: &[Entity], transform: Transform) {
    if let Some(source) = node.source { if let Some(entity) = sources.get(source) { append_entity(output, entity, transform); } }
    for child in &node.children { append_node(output, child, sources, transform); }
}

fn append_entity(output: &mut String, entity: &Entity, transform: Transform) {
    match entity.kind.as_str() {
        "LINE" => if let (Some(a), Some(b)) = (xy(entity, 0), xy(entity, 1)) { write_entity(output, "LINE", &[(10, transform.point(a).0), (20, transform.point(a).1), (11, transform.point(b).0), (21, transform.point(b).1)]); },
        "LWPOLYLINE" | "POLYLINE" => {
            let points: Vec<(f64, f64)> = entity.values.get(&10).into_iter().flatten().zip(entity.values.get(&20).into_iter().flatten()).filter_map(|(x, y)| Some((x.parse().ok()?, y.parse().ok()?))).collect();
            if points.len() >= 2 {
                output.push_str("0\nLWPOLYLINE\n90\n"); output.push_str(&points.len().to_string()); output.push('\n');
                output.push_str("70\n"); output.push_str(if (number(entity, 70).unwrap_or(0.0) as i32 & 1) != 0 { "1\n" } else { "0\n" });
                for point in points { let point = transform.point(point); output.push_str("10\n"); output.push_str(&f(point.0)); output.push_str("\n20\n"); output.push_str(&f(point.1)); output.push('\n'); }
            }
        }
        "CIRCLE" => if let (Some(center), Some(radius)) = (xy(entity, 0), number(entity, 40)) { let center = transform.point(center); write_entity(output, "CIRCLE", &[(10, center.0), (20, center.1), (40, radius)]); },
        "ARC" => if let (Some(center), Some(radius), Some(start), Some(end)) = (xy(entity, 0), number(entity, 40), number(entity, 50), number(entity, 51)) { let center = transform.point(center); write_entity(output, "ARC", &[(10, center.0), (20, center.1), (40, radius), (50, start - transform.rotation), (51, end - transform.rotation)]); },
        "ELLIPSE" => if let (Some(center), Some(major_x), Some(major_y), Some(ratio)) = (xy(entity, 0), number(entity, 11), number(entity, 21), number(entity, 40)) {
            let center = transform.point(center); let radians = transform.rotation.to_radians();
            let x = radians.cos() * major_x + radians.sin() * major_y; let y = -radians.sin() * major_x + radians.cos() * major_y;
            write_entity(output, "ELLIPSE", &[(10, center.0), (20, center.1), (11, x), (21, y), (40, ratio), (41, number(entity, 41).unwrap_or(0.0)), (42, number(entity, 42).unwrap_or(std::f64::consts::TAU))]);
        },
        _ => {}
    }
}

fn write_entity(output: &mut String, kind: &str, values: &[(i32, f64)]) {
    output.push_str("0\n"); output.push_str(kind); output.push('\n');
    for (code, value) in values { output.push_str(&code.to_string()); output.push('\n'); output.push_str(&f(*value)); output.push('\n'); }
}

fn decode_placement(input: &[u8]) -> Result<PlacementRequest, String> {
    let mut reader = PlacementReader { data: input, offset: 0 };
    if reader.take(4)? != b"SNP1" { return Err("Placement data has an invalid header.".into()); }
    let bin_source = reader.u32()?; for _ in 0..4 { reader.f64()?; }
    let tree_count = reader.u32()?; let mut tree = Vec::with_capacity(tree_count);
    for _ in 0..tree_count { tree.push(reader.node()?); }
    let sheet_count = reader.u32()?; let mut sheets = Vec::with_capacity(sheet_count);
    for _ in 0..sheet_count { let count = reader.u32()?; let mut sheet = Vec::with_capacity(count); for _ in 0..count { sheet.push(Placement { id: reader.u32()?, x: reader.f64()?, y: reader.f64()?, rotation: reader.f64()? }); } sheets.push(sheet); }
    if reader.offset != input.len() { return Err("Placement data has trailing bytes.".into()); }
    Ok(PlacementRequest { bin_source, tree, sheets })
}

struct PlacementReader<'a> { data: &'a [u8], offset: usize }
impl<'a> PlacementReader<'a> {
    fn take(&mut self, size: usize) -> Result<&'a [u8], String> { let end = self.offset.checked_add(size).ok_or("Placement data is too large")?; let value = self.data.get(self.offset..end).ok_or("Placement data is truncated")?; self.offset = end; Ok(value) }
    fn u32(&mut self) -> Result<usize, String> { Ok(u32::from_le_bytes(self.take(4)?.try_into().expect("fixed width")) as usize) }
    fn f64(&mut self) -> Result<f64, String> { let value = f64::from_le_bytes(self.take(8)?.try_into().expect("fixed width")); if value.is_finite() { Ok(value) } else { Err("Placement data contains a non-finite coordinate.".into()) } }
    fn node(&mut self) -> Result<TreeNode, String> { let source = match self.take(1)?[0] { 0 => None, 1 => Some(self.u32()?), _ => return Err("Placement tree has an invalid source tag.".into()) }; let count = self.u32()?; let mut children = Vec::with_capacity(count); for _ in 0..count { children.push(self.node()?); } Ok(TreeNode { source, children }) }
}

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
