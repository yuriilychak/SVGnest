//! ASCII DXF to SVGnest's shared SVG format core.

use std::collections::HashMap;
use std::io::Cursor;
use acadrust::{DxfReader, EntityType};
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
    let (x, y, width, height) = svg_view_box(&entities);
    let raw_svg = format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"{} {} {} {}\" width=\"{}\" height=\"{}\" fill=\"none\" stroke=\"black\">{}</svg>", f(x), f(y), f(width), f(height), f(width), f(height), paths.into_iter().map(|path| format!("<path d=\"{path}\"/>" )).collect::<String>());
    svg_format_algo::core_input_to_svg(raw_svg.as_bytes())
}

/// DXF has no document canvas. Derive a padded SVG viewport from supported
/// entity coordinates so the preview is visible and selectable in the app.
fn svg_view_box(entities: &[Entity]) -> (f64, f64, f64, f64) {
    let mut bounds: Option<(f64, f64, f64, f64)> = None;
    let mut include = |x: f64, y: f64| {
        if !x.is_finite() || !y.is_finite() { return; }
        bounds = Some(match bounds {
            Some((min_x, min_y, max_x, max_y)) => (min_x.min(x), min_y.min(y), max_x.max(x), max_y.max(y)),
            None => (x, y, x, y),
        });
    };
    for entity in entities {
        for (x_code, y_code) in [(10, 20), (11, 21)] {
            let xs = entity.values.get(&x_code).into_iter().flatten();
            let ys = entity.values.get(&y_code).into_iter().flatten();
            for (x, y) in xs.zip(ys) {
                if let (Ok(x), Ok(y)) = (x.parse::<f64>(), y.parse::<f64>()) { include(x, -y); }
            }
        }
        if matches!(entity.kind.as_str(), "CIRCLE" | "ARC") {
            if let (Some((x, y)), Some(radius)) = (xy(entity, 0), number(entity, 40)) {
                include(x - radius, -y - radius); include(x + radius, -y + radius);
            }
        }
        if entity.kind == "ELLIPSE" {
            if let (Some((x, y)), Some((axis_x, axis_y)), Some(ratio)) = (xy(entity, 0), xy(entity, 1), number(entity, 40)) {
                let radius = axis_x.hypot(axis_y) * ratio.abs().max(1.0);
                include(x - radius, -y - radius); include(x + radius, -y + radius);
            }
        }
    }
    let (min_x, min_y, max_x, max_y) = bounds.unwrap_or((0.0, 0.0, 1.0, 1.0));
    let span = (max_x - min_x).max(max_y - min_y).max(1.0);
    let padding = (span * 0.02).max(1.0);
    (min_x - padding, min_y - padding, (max_x - min_x).max(1.0) + 2.0 * padding, (max_y - min_y).max(1.0) + 2.0 * padding)
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
    let document = DxfReader::from_reader(Cursor::new(source.as_bytes().to_vec()))
        .and_then(|reader| reader.read()).map_err(|error| format!("Unable to read DXF: {error}"))?;
    let mut output = Vec::new();
    for entity in document.model_space_entities() {
        if let EntityType::Insert(insert) = entity {
            let block: Vec<EntityType> = document.entities_in_block(&insert.block_name).cloned().collect();
            output.extend(insert.explode(&block).iter().filter_map(project_entity));
        } else if let Some(entity) = project_entity(entity) {
            output.push(entity);
        }
    }
    Ok(output)
}

fn project_entity(entity: &EntityType) -> Option<Entity> {
    let mut values = HashMap::new();
    let mut put = |code: i32, value: f64| { values.entry(code).or_insert_with(Vec::new).push(value.to_string()); };
    let (kind, layer) = match entity {
        EntityType::Line(value) => { put(10, value.start.x); put(20, value.start.y); put(11, value.end.x); put(21, value.end.y); ("LINE", &value.common.layer) }
        EntityType::Circle(value) => { put(10, value.center.x); put(20, value.center.y); put(40, value.radius); ("CIRCLE", &value.common.layer) }
        EntityType::Arc(value) => { put(10, value.center.x); put(20, value.center.y); put(40, value.radius); put(50, value.start_angle.to_degrees()); put(51, value.end_angle.to_degrees()); ("ARC", &value.common.layer) }
        EntityType::Ellipse(value) => { put(10, value.center.x); put(20, value.center.y); put(11, value.major_axis.x); put(21, value.major_axis.y); put(40, value.minor_axis_ratio); put(41, value.start_parameter); put(42, value.end_parameter); ("ELLIPSE", &value.common.layer) }
        EntityType::LwPolyline(value) => { for vertex in &value.vertices { put(10, vertex.location.x); put(20, vertex.location.y); } put(70, if value.is_closed { 1.0 } else { 0.0 }); ("LWPOLYLINE", &value.common.layer) }
        EntityType::Spline(value) => { for point in &value.control_points { put(10, point.x); put(20, point.y); } for knot in &value.knots { put(40, *knot); } for weight in &value.weights { put(41, *weight); } put(71, value.degree as f64); ("SPLINE", &value.common.layer) }
        _ => return None,
    };
    values.insert(8, vec![layer.clone()]);
    Some(Entity { kind: kind.into(), values })
}

fn entity_path(entity: &Entity) -> Option<String> {
    match entity.kind.as_str() {
        "LINE" => Some(format!("M {} L {}", point(xy(entity, 0)?), point(xy(entity, 1)?))),
        "LWPOLYLINE" | "POLYLINE" => polyline(entity),
        "CIRCLE" => { let center = xy(entity, 0)?; let radius = number(entity, 40)?; (radius > 0.0).then(|| format!("M {} {} A {} {} 0 1 0 {} {} A {} {} 0 1 0 {} {} Z", f(center.0 + radius), f(-center.1), f(radius), f(radius), f(center.0 - radius), f(-center.1), f(radius), f(radius), f(center.0 + radius), f(-center.1))) }
        "ARC" => arc(entity),
        "ELLIPSE" => ellipse(entity),
		"SPLINE" => spline_path(entity),
        _ => None,
    }
}

fn spline_path(entity: &Entity) -> Option<String> {
    let points = spline_points(entity)?; if points.len() < 2 { return None; }
    let closed = (number(entity, 70).unwrap_or(0.0) as i32 & 1) != 0;
    Some(format!("M {}{}{}", point(points[0]), points[1..].iter().map(|vertex| format!(" L {}", point(*vertex))).collect::<String>(), if closed { " Z" } else { "" }))
}

/// Evaluates a planar, optionally rational DXF B-spline. DXF supplies degree
/// (71), knots (40), control points (10/20), and optional weights (41).
fn spline_points(entity: &Entity) -> Option<Vec<(f64, f64)>> {
    let xs = entity.values.get(&10)?; let ys = entity.values.get(&20)?;
    let control: Vec<(f64, f64)> = xs.iter().zip(ys).filter_map(|(x, y)| Some((x.parse().ok()?, y.parse().ok()?))).collect();
    let degree = number(entity, 71)? as usize; let knots: Vec<f64> = entity.values.get(&40)?.iter().filter_map(|value| value.parse().ok()).collect();
    if control.len() < degree + 1 || knots.len() < control.len() + degree + 1 || degree > 16 { return None; }
    let weights: Vec<f64> = entity.values.get(&41).map(|values| values.iter().filter_map(|value| value.parse().ok()).collect()).unwrap_or_default();
    let start = knots[degree]; let end = knots[control.len()]; if !start.is_finite() || !end.is_finite() || end <= start { return None; }
    let basis = |index: usize, order: usize, t: f64| -> f64 {
        fn value(index: usize, order: usize, t: f64, knots: &[f64]) -> f64 {
            if order == 0 { return if knots[index] <= t && t < knots[index + 1] { 1.0 } else { 0.0 }; }
            let left = if knots[index + order] > knots[index] { (t - knots[index]) / (knots[index + order] - knots[index]) * value(index, order - 1, t, knots) } else { 0.0 };
            let right = if knots[index + order + 1] > knots[index + 1] { (knots[index + order + 1] - t) / (knots[index + order + 1] - knots[index + 1]) * value(index + 1, order - 1, t, knots) } else { 0.0 };
            left + right
        }
        value(index, order, t, &knots)
    };
    let sample = |t: f64| -> Option<(f64, f64)> { let mut x = 0.0; let mut y = 0.0; let mut total = 0.0; for (index, point) in control.iter().enumerate() { let weight = weights.get(index).copied().unwrap_or(1.0); let factor = basis(index, degree, t) * weight; x += point.0 * factor; y += point.1 * factor; total += factor; } (total.abs() > f64::EPSILON).then_some((x / total, y / total)) };
    let mut output = Vec::new();
    for pair in knots.windows(2).skip(degree).take(control.len().saturating_sub(degree)) { if pair[1] <= pair[0] { continue; } for step in 0..12 { if let Some(point) = sample(pair[0] + (pair[1] - pair[0]) * step as f64 / 12.0) { output.push(point); } } }
    output.push(sample(end - (end - start) * 1e-12).or_else(|| control.last().copied())?);
    Some(output)
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
        "LINE" => if let (Some(a), Some(b)) = (xy(entity, 0), xy(entity, 1)) { write_entity(output, entity, "LINE", &[(10, transform.point(a).0), (20, transform.point(a).1), (11, transform.point(b).0), (21, transform.point(b).1)]); },
        "LWPOLYLINE" | "POLYLINE" => {
            let points: Vec<(f64, f64)> = entity.values.get(&10).into_iter().flatten().zip(entity.values.get(&20).into_iter().flatten()).filter_map(|(x, y)| Some((x.parse().ok()?, y.parse().ok()?))).collect();
            if points.len() >= 2 {
                output.push_str("0\nLWPOLYLINE\n"); append_layer(output, entity); output.push_str("90\n"); output.push_str(&points.len().to_string()); output.push('\n');
                output.push_str("70\n"); output.push_str(if (number(entity, 70).unwrap_or(0.0) as i32 & 1) != 0 { "1\n" } else { "0\n" });
                for point in points { let point = transform.point(point); output.push_str("10\n"); output.push_str(&f(point.0)); output.push_str("\n20\n"); output.push_str(&f(point.1)); output.push('\n'); }
            }
        }
        "CIRCLE" => if let (Some(center), Some(radius)) = (xy(entity, 0), number(entity, 40)) { let center = transform.point(center); write_entity(output, entity, "CIRCLE", &[(10, center.0), (20, center.1), (40, radius)]); },
        "ARC" => if let (Some(center), Some(radius), Some(start), Some(end)) = (xy(entity, 0), number(entity, 40), number(entity, 50), number(entity, 51)) { let center = transform.point(center); write_entity(output, entity, "ARC", &[(10, center.0), (20, center.1), (40, radius), (50, start - transform.rotation), (51, end - transform.rotation)]); },
        "ELLIPSE" => if let (Some(center), Some(major_x), Some(major_y), Some(ratio)) = (xy(entity, 0), number(entity, 11), number(entity, 21), number(entity, 40)) {
            let center = transform.point(center); let radians = transform.rotation.to_radians();
            let x = radians.cos() * major_x + radians.sin() * major_y; let y = -radians.sin() * major_x + radians.cos() * major_y;
            write_entity(output, entity, "ELLIPSE", &[(10, center.0), (20, center.1), (11, x), (21, y), (40, ratio), (41, number(entity, 41).unwrap_or(0.0)), (42, number(entity, 42).unwrap_or(std::f64::consts::TAU))]);
        },
        "SPLINE" => if let Some(points) = spline_points(entity) { append_polyline(output, entity, &points, (number(entity, 70).unwrap_or(0.0) as i32 & 1) != 0, transform); },
        _ => {}
    }
}

fn append_polyline(output: &mut String, entity: &Entity, points: &[(f64, f64)], closed: bool, transform: Transform) {
    if points.len() < 2 { return; }
    output.push_str("0\nLWPOLYLINE\n"); append_layer(output, entity); output.push_str("90\n"); output.push_str(&points.len().to_string()); output.push('\n'); output.push_str(if closed { "70\n1\n" } else { "70\n0\n" });
    for point in points { let point = transform.point(*point); output.push_str("10\n"); output.push_str(&f(point.0)); output.push_str("\n20\n"); output.push_str(&f(point.1)); output.push('\n'); }
}

fn append_layer(output: &mut String, entity: &Entity) { if let Some(layer) = entity.values.get(&8).and_then(|values| values.first()) { output.push_str("8\n"); output.push_str(layer); output.push('\n'); } }
fn write_entity(output: &mut String, entity: &Entity, kind: &str, values: &[(i32, f64)]) {
    output.push_str("0\n"); output.push_str(kind); output.push('\n'); append_layer(output, entity);
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
        assert!(svg.contains("viewBox="));
        assert!(svg.contains("data-svgnest-source=\"0\""));
    }
    #[test]
    fn rejects_binary_dxf() { assert!(input_to_svg_core(b"AutoCAD Binary DXF\0").is_err()); }
    #[test]
    fn flattens_a_linear_spline_to_svg() {
        let dxf = "0\nSECTION\n2\nENTITIES\n0\nSPLINE\n70\n16\n71\n1\n40\n0\n40\n0\n40\n1\n40\n1\n10\n0\n20\n0\n10\n10\n20\n0\n0\nENDSEC\n0\nEOF\n";
        let svg = input_to_svg_core(dxf.as_bytes()).expect("valid spline DXF");
        assert!(svg.contains("data-svgnest-source=\"0\""));
    }
    #[test]
    fn expands_an_inserted_block() {
        let dxf = "0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nCUT\n10\n0\n20\n0\n0\nLINE\n10\n0\n20\n0\n11\n10\n21\n0\n0\nENDBLK\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nINSERT\n2\nCUT\n10\n5\n20\n7\n0\nENDSEC\n0\nEOF\n";
        let svg = input_to_svg_core(dxf.as_bytes()).expect("valid inserted block DXF");
        assert!(svg.contains("data-svgnest-source=\"0\""));
    }
}
