//! SVGnest's DOM-free SVG core.
//!
//! `usvg` is intentionally the only SVG parser in this crate.  Browser DOM
//! APIs must not be used for SVG normalization or geometry extraction.

use tiny_skia_path::{PathSegment, Point};
#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

const MAX_FLATTEN_DEPTH: u8 = 20;

#[derive(Debug, PartialEq)]
struct Polygon {
    source: usize,
    points: Vec<f64>,
}

struct OutputRequest {
    placements: Vec<Vec<Placement>>,
    tree: Vec<TreeNode>,
    bin_bounds: Bounds,
    bin_source: usize,
}

struct Placement {
    id: usize,
    x: f64,
    y: f64,
    rotation: f64,
}

struct TreeNode {
    source: Option<usize>,
    children: Vec<TreeNode>,
}

struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn parse_svg(input: &[u8]) -> Result<usvg::Tree, String> {
    // Parsing happens inside the WASM sandbox. This crate does not provide a
    // filesystem or network image resolver, keeping uploaded SVG self-contained.
    usvg::Tree::from_data(input, &usvg::Options::default())
        .map_err(|error| format!("Invalid SVG: {error}"))
}

/// Parses and normalizes an SVG entirely in Rust, returning canonical SVG
/// markup. This is the first public WASM seam; polygon extraction and placed
/// SVG generation will consume the same parsed representation next.
pub fn core_input_to_svg(input: &[u8]) -> Result<String, String> {
    let tree = parse_svg(input)?;
    display_svg(&tree)
}

/// Parses SVG and returns flattened, source-indexed contours as JSON.
///
/// The JSON payload is deliberately data-only so the TypeScript adapter can
/// attach the `source` field to its legacy `number[]` polygon representation
/// without involving browser SVG objects:
/// `{ "polygons": [{ "source": 0, "points": [x0, y0, ...] }], "sources": [0] }`.
pub fn core_input_to_polygons(input: &[u8], tolerance: f64) -> Result<Vec<u8>, String> {
    if !tolerance.is_finite() || tolerance <= 0.0 {
        return Err("Curve tolerance must be a positive finite number".into());
    }
    let tree = parse_svg(input)?;
    let polygons = polygonize(&tree, tolerance as f32)?;
    Ok(polygons_binary(&polygons))
}

/// Renders placed source contours into one SVG document per nesting sheet.
/// Placement data uses the compact `SNP1` binary encoding from format-plugin.
/// The renderer receives only Rust-normalized paths; it never reads or mutates
/// a browser SVG DOM.
pub fn core_output_to_svg(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, String> {
    let documents = core_output_documents(input, placement_data)?;
    Ok(svg_documents_binary(&documents))
}

/// Renders placed source contours without serializing the intermediate SVG
/// documents. Format-specific binary exporters use this to avoid a binary
/// payload round-trip through the public WASM display API.
pub fn core_output_documents(input: &[u8], placement_data: &[u8]) -> Result<Vec<String>, String> {
    let request = decode_output_request(placement_data)?;
    validate_output_request(&request)?;
    let tree = parse_svg(input)?;
    let sources = source_fragments(&tree)?;
    if request.bin_source >= sources.len() {
        return Err("Bin source does not exist in the SVG".into());
    }
    for node in &request.tree {
        validate_tree_sources(node, sources.len())?;
    }
    Ok(output_documents(&request, &sources))
}

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn input_to_svg(input: &[u8]) -> Result<String, JsValue> { core_input_to_svg(input).map_err(|error| JsValue::from_str(&error)) }

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn input_to_polygons(input: &[u8], tolerance: f64) -> Result<Vec<u8>, JsValue> { core_input_to_polygons(input, tolerance).map_err(|error| JsValue::from_str(&error)) }

#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn output_to_svg(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, JsValue> { core_output_to_svg(input, placement_data).map_err(|error| JsValue::from_str(&error)) }

/// SVG's native persisted output is the same shared SVG-document payload used
/// for preview output, preserving the uniform format-core WASM surface.
#[cfg(feature = "wasm")]
#[wasm_bindgen]
pub fn output_to_data(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, JsValue> { core_output_to_svg(input, placement_data).map_err(|error| JsValue::from_str(&error)) }

const PLACEMENT_MAGIC: &[u8; 4] = b"SNP1";
const MAX_TREE_DEPTH: u8 = 100;

struct PlacementReader<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> PlacementReader<'a> {
    fn new(data: &'a [u8]) -> Self { Self { data, offset: 0 } }
    fn take(&mut self, size: usize) -> Result<&'a [u8], String> {
        let end = self.offset.checked_add(size).ok_or("Placement data is too large")?;
        let bytes = self.data.get(self.offset..end).ok_or("Placement data is truncated")?;
        self.offset = end;
        Ok(bytes)
    }
    fn u8(&mut self) -> Result<u8, String> { Ok(self.take(1)?[0]) }
    fn u32(&mut self) -> Result<usize, String> {
        let bytes: [u8; 4] = self.take(4)?.try_into().expect("fixed-width read");
        usize::try_from(u32::from_le_bytes(bytes)).map_err(|_| "Placement integer is too large".to_string())
    }
    fn f64(&mut self) -> Result<f64, String> {
        let bytes: [u8; 8] = self.take(8)?.try_into().expect("fixed-width read");
        let value = f64::from_le_bytes(bytes);
        if value.is_finite() { Ok(value) } else { Err("Placement coordinates must be finite".into()) }
    }
    fn tree(&mut self, depth: u8) -> Result<TreeNode, String> {
        if depth >= MAX_TREE_DEPTH { return Err("Placement tree is too deeply nested".into()); }
        let source = match self.u8()? { 0 => None, 1 => Some(self.u32()?), _ => return Err("Placement tree has an invalid source tag".into()) };
        let children_count = self.u32()?;
        if children_count > self.data.len().saturating_sub(self.offset) / 5 { return Err("Placement tree child count is invalid".into()); }
        let mut children = Vec::with_capacity(children_count);
        for _ in 0..children_count { children.push(self.tree(depth + 1)?); }
        Ok(TreeNode { source, children })
    }
}

fn decode_output_request(data: &[u8]) -> Result<OutputRequest, String> {
    let mut reader = PlacementReader::new(data);
    if reader.take(4)? != PLACEMENT_MAGIC { return Err("Unsupported placement data encoding".into()); }
    let bin_source = reader.u32()?;
    let bin_bounds = Bounds { x: reader.f64()?, y: reader.f64()?, width: reader.f64()?, height: reader.f64()? };
    let tree_count = reader.u32()?;
    if tree_count > data.len().saturating_sub(reader.offset) / 5 { return Err("Placement tree count is invalid".into()); }
    let mut tree = Vec::with_capacity(tree_count);
    for _ in 0..tree_count { tree.push(reader.tree(0)?); }
    let sheet_count = reader.u32()?;
    if sheet_count > data.len().saturating_sub(reader.offset) / 4 { return Err("Placement sheet count is invalid".into()); }
    let mut placements = Vec::with_capacity(sheet_count);
    for _ in 0..sheet_count {
        let count = reader.u32()?;
        if count > data.len().saturating_sub(reader.offset) / 28 { return Err("Placement count is invalid".into()); }
        let mut sheet = Vec::with_capacity(count);
        for _ in 0..count { sheet.push(Placement { id: reader.u32()?, x: reader.f64()?, y: reader.f64()?, rotation: reader.f64()? }); }
        placements.push(sheet);
    }
    if reader.offset != data.len() { return Err("Placement data has trailing bytes".into()); }
    Ok(OutputRequest { placements, tree, bin_bounds, bin_source })
}

fn polygonize(tree: &usvg::Tree, tolerance: f32) -> Result<Vec<Polygon>, String> {
    let mut polygons = Vec::new();
    collect_group(tree.root(), tolerance, &mut polygons)?;
    Ok(polygons)
}

fn collect_group(
    group: &usvg::Group,
    tolerance: f32,
    polygons: &mut Vec<Polygon>,
) -> Result<(), String> {
    for node in group.children() {
        match node {
            usvg::Node::Group(group) => collect_group(group, tolerance, polygons)?,
            usvg::Node::Path(path) if path.is_visible() => {
                let path = path
                    .data()
                    .clone()
                    .transform(path.abs_transform())
                    .ok_or("SVG path transform produced non-finite coordinates")?;
                for points in flatten_path(&path, tolerance) {
                    if !points.is_empty() {
                        let source = polygons.len();
                        polygons.push(Polygon { source, points });
                    }
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn flatten_path(path: &tiny_skia_path::Path, tolerance: f32) -> Vec<Vec<f64>> {
    let mut contours = Vec::new();
    let mut contour = Vec::new();
    let mut current = Point::zero();

    for segment in path.segments() {
        match segment {
            PathSegment::MoveTo(point) => {
                finish_contour(&mut contours, &mut contour);
                push_point(&mut contour, point);
                current = point;
            }
            PathSegment::LineTo(point) => {
                push_point(&mut contour, point);
                current = point;
            }
            PathSegment::QuadTo(control, point) => {
                flatten_quad(&mut contour, current, control, point, tolerance, 0);
                current = point;
            }
            PathSegment::CubicTo(control1, control2, point) => {
                flatten_cubic(
                    &mut contour,
                    current,
                    control1,
                    control2,
                    point,
                    tolerance,
                    0,
                );
                current = point;
            }
            PathSegment::Close => finish_contour(&mut contours, &mut contour),
        }
    }
    finish_contour(&mut contours, &mut contour);
    contours
}

fn finish_contour(contours: &mut Vec<Vec<f64>>, contour: &mut Vec<f64>) {
    if contour.len() >= 4 {
        let end = contour.len() - 2;
        if approximately_equal(contour[0] as f32, contour[end] as f32)
            && approximately_equal(contour[1] as f32, contour[end + 1] as f32)
        {
            contour.truncate(end);
        }
    }
    if !contour.is_empty() {
        contours.push(std::mem::take(contour));
    }
}

fn push_point(points: &mut Vec<f64>, point: Point) {
    if let Some((&x, &y)) = points
        .get(points.len().saturating_sub(2))
        .zip(points.get(points.len().saturating_sub(1)))
    {
        if approximately_equal(x as f32, point.x) && approximately_equal(y as f32, point.y) {
            return;
        }
    }
    points.extend([point.x as f64, point.y as f64]);
}

fn flatten_quad(
    points: &mut Vec<f64>,
    from: Point,
    control: Point,
    to: Point,
    tolerance: f32,
    depth: u8,
) {
    if depth == MAX_FLATTEN_DEPTH || distance_to_line(control, from, to) <= tolerance {
        push_point(points, to);
        return;
    }
    let first_control = midpoint(from, control);
    let second_control = midpoint(control, to);
    let middle = midpoint(first_control, second_control);
    flatten_quad(points, from, first_control, middle, tolerance, depth + 1);
    flatten_quad(points, middle, second_control, to, tolerance, depth + 1);
}

fn flatten_cubic(
    points: &mut Vec<f64>,
    from: Point,
    control1: Point,
    control2: Point,
    to: Point,
    tolerance: f32,
    depth: u8,
) {
    if depth == MAX_FLATTEN_DEPTH
        || distance_to_line(control1, from, to).max(distance_to_line(control2, from, to))
            <= tolerance
    {
        push_point(points, to);
        return;
    }
    let first_control = midpoint(from, control1);
    let between_controls = midpoint(control1, control2);
    let second_control = midpoint(control2, to);
    let first_middle = midpoint(first_control, between_controls);
    let second_middle = midpoint(between_controls, second_control);
    let middle = midpoint(first_middle, second_middle);
    flatten_cubic(
        points,
        from,
        first_control,
        first_middle,
        middle,
        tolerance,
        depth + 1,
    );
    flatten_cubic(
        points,
        middle,
        second_middle,
        second_control,
        to,
        tolerance,
        depth + 1,
    );
}

fn midpoint(a: Point, b: Point) -> Point {
    Point::from_xy((a.x + b.x) * 0.5, (a.y + b.y) * 0.5)
}

fn distance_to_line(point: Point, start: Point, end: Point) -> f32 {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let length = (dx * dx + dy * dy).sqrt();
    if length <= f32::EPSILON {
        return ((point.x - start.x).powi(2) + (point.y - start.y).powi(2)).sqrt();
    }
    ((point.x - start.x) * dy - (point.y - start.y) * dx).abs() / length
}

fn approximately_equal(a: f32, b: f32) -> bool {
    (a - b).abs() <= 0.000_01
}

fn polygons_binary(polygons: &[Polygon]) -> Vec<u8> {
    let size = 8 + polygons.iter().map(|polygon| 8 + polygon.points.len() * 8).sum::<usize>();
    let mut output = Vec::with_capacity(size);
    output.extend_from_slice(b"SNP2");
    output.extend_from_slice(&(polygons.len() as u32).to_le_bytes());
    for polygon in polygons {
        output.extend_from_slice(&(polygon.source as u32).to_le_bytes());
        output.extend_from_slice(&(polygon.points.len() as u32).to_le_bytes());
        for point in &polygon.points { output.extend_from_slice(&point.to_le_bytes()); }
    }
    output
}

fn validate_output_request(request: &OutputRequest) -> Result<(), String> {
    let bounds = &request.bin_bounds;
    if ![bounds.x, bounds.y, bounds.width, bounds.height]
        .iter()
        .all(|value| value.is_finite())
        || bounds.width <= 0.0
        || bounds.height <= 0.0
    {
        return Err("Bin bounds must be finite and have positive dimensions".to_string());
    }
    for sheet in &request.placements {
        for placement in sheet {
            if ![placement.x, placement.y, placement.rotation]
                .iter()
                .all(|value| value.is_finite())
            {
                return Err("Placement coordinates must be finite".to_string());
            }
            if placement.id >= request.tree.len() {
                return Err("Placement refers to a missing nesting tree node".to_string());
            }
        }
    }
    Ok(())
}

fn validate_tree_sources(node: &TreeNode, source_count: usize) -> Result<(), String> {
    if let Some(source) = node.source {
        if source >= source_count {
            return Err("Nesting tree refers to a missing SVG source".to_string());
        }
    }
    for child in &node.children {
        validate_tree_sources(child, source_count)?;
    }
    Ok(())
}

fn source_fragments(tree: &usvg::Tree) -> Result<Vec<String>, String> {
    let mut fragments = Vec::new();
    collect_source_fragments(tree.root(), &mut fragments)?;
    Ok(fragments)
}

/// Produces the interactive input SVG consumed by the GUI. Every rendered
/// contour carries the same source index returned by `input_to_polygons`, so
/// click selection is UI-owned but never has to recover SVG geometry itself.
fn display_svg(tree: &usvg::Tree) -> Result<String, String> {
    let width = tree.size().width() as f64;
    let height = tree.size().height() as f64;
    if !width.is_finite() || !height.is_finite() || width <= 0.0 || height <= 0.0 {
        return Err("SVG has invalid display dimensions".to_string());
    }
    let mut output = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\" width=\"{}\" height=\"{}\">",
        format_number(width),
        format_number(height),
        format_number(width),
        format_number(height),
    );
    for (source, fragment) in source_fragments(tree)?.iter().enumerate() {
        output.push_str(&fragment.replacen(
            "<path ",
            &format!("<path data-svgnest-source=\"{source}\" "),
            1,
        ));
    }
    output.push_str("</svg>");
    Ok(output)
}

fn collect_source_fragments(
    group: &usvg::Group,
    fragments: &mut Vec<String>,
) -> Result<(), String> {
    for node in group.children() {
        match node {
            usvg::Node::Group(group) => collect_source_fragments(group, fragments)?,
            usvg::Node::Path(path) if path.is_visible() => {
                let style = path_style(path);
                let geometry = path
                    .data()
                    .clone()
                    .transform(path.abs_transform())
                    .ok_or("SVG path transform produced non-finite coordinates")?;
                for data in split_path_data(&geometry) {
                    fragments.push(format!("<path d=\"{data}\"{style}/>"));
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn split_path_data(path: &tiny_skia_path::Path) -> Vec<String> {
    let mut paths = Vec::new();
    let mut current = String::new();
    for segment in path.segments() {
        match segment {
            PathSegment::MoveTo(point) => {
                if !current.is_empty() {
                    paths.push(std::mem::take(&mut current));
                }
                write_point_command(&mut current, 'M', point);
            }
            PathSegment::LineTo(point) => write_point_command(&mut current, 'L', point),
            PathSegment::QuadTo(control, point) => {
                current.push('Q');
                write_point(&mut current, control);
                current.push(' ');
                write_point(&mut current, point);
            }
            PathSegment::CubicTo(control1, control2, point) => {
                current.push('C');
                write_point(&mut current, control1);
                current.push(' ');
                write_point(&mut current, control2);
                current.push(' ');
                write_point(&mut current, point);
            }
            PathSegment::Close => current.push('Z'),
        }
    }
    if !current.is_empty() {
        paths.push(current);
    }
    paths
}

fn write_point_command(output: &mut String, command: char, point: Point) {
    output.push(command);
    write_point(output, point);
}

fn write_point(output: &mut String, point: Point) {
    output.push_str(&format_number(point.x as f64));
    output.push(' ');
    output.push_str(&format_number(point.y as f64));
}

fn path_style(path: &usvg::Path) -> String {
    let mut style = String::new();
    match path.fill().map(|fill| fill.paint()) {
        None => style.push_str(" fill=\"none\""),
        Some(usvg::Paint::Color(color)) => {
            style.push_str(&format!(
                " fill=\"#{:02x}{:02x}{:02x}\"",
                color.red, color.green, color.blue
            ));
        }
        Some(_) => style.push_str(" fill=\"none\""),
    }
    if let Some(stroke) = path.stroke() {
        if let usvg::Paint::Color(color) = stroke.paint() {
            style.push_str(&format!(
                " stroke=\"#{:02x}{:02x}{:02x}\"",
                color.red, color.green, color.blue
            ));
            style.push_str(&format!(
                " stroke-width=\"{}\"",
                format_number(stroke.width().get() as f64)
            ));
        }
    }
    style
}

fn output_documents(request: &OutputRequest, sources: &[String]) -> Vec<String> {
    request
        .placements
        .iter()
        .map(|placements| output_document(request, sources, placements))
        .collect()
}

fn svg_documents_binary(documents: &[String]) -> Vec<u8> {
    let size = 8 + documents.iter().map(|document| 4 + document.len()).sum::<usize>();
    let mut output = Vec::with_capacity(size);
    output.extend_from_slice(b"SNP3"); output.extend_from_slice(&(documents.len() as u32).to_le_bytes());
    for document in documents { output.extend_from_slice(&(document.len() as u32).to_le_bytes()); output.extend_from_slice(document.as_bytes()); }
    output
}

fn output_document(
    request: &OutputRequest,
    sources: &[String],
    placements: &[Placement],
) -> String {
    let bounds = &request.bin_bounds;
    let mut output = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\" width=\"{}px\" height=\"{}px\">",
        format_number(bounds.width),
        format_number(bounds.height),
        format_number(bounds.width),
        format_number(bounds.height),
    );
    output.push_str(&format!(
        "<g class=\"bin\" transform=\"translate({} {})\">{}</g>",
        format_number(-bounds.x),
        format_number(-bounds.y),
        sources[request.bin_source]
    ));
    for placement in placements {
        output.push_str(&format!(
            "<g transform=\"translate({} {}) rotate({})\">",
            format_number(placement.x),
            format_number(placement.y),
            format_number(placement.rotation),
        ));
        append_placed_part(&mut output, &request.tree[placement.id], sources, false);
        output.push_str("</g>");
    }
    output.push_str("</svg>");
    output
}

fn append_placed_part(output: &mut String, node: &TreeNode, sources: &[String], is_hole: bool) {
    if let Some(source) = node.source {
        let fragment = &sources[source];
        if is_hole {
            output.push_str(&fragment.replacen("<path ", "<path class=\"hole\" ", 1));
        } else {
            output.push_str(fragment);
        }
    }
    for child in &node.children {
        append_placed_part(output, child, sources, !is_hole);
    }
}

fn format_number(value: f64) -> String {
    let mut output = format!("{value:.6}");
    while output.ends_with('0') {
        output.pop();
    }
    if output.ends_with('.') {
        output.pop();
    }
    if output == "-0" {
        "0".to_string()
    } else {
        output
    }
}

#[cfg(test)]
mod tests {
    use super::{
        core_output_documents, display_svg, output_documents, parse_svg, polygonize, polygons_binary, source_fragments, svg_documents_binary,
        Bounds, OutputRequest, Placement, TreeNode,
    };

    #[test]
    fn parses_a_supported_shape_without_a_browser() {
        let tree = parse_svg(
			br#"<svg xmlns="http://www.w3.org/2000/svg"><rect x="1" y="2" width="3" height="4"/></svg>"#,
		)
		.expect("valid SVG must parse");
        assert!(!tree.root().children().is_empty());
    }

    #[test]
    fn rejects_invalid_svg() {
        assert!(parse_svg(b"not svg").is_err());
    }

    #[test]
    fn polygonizes_shapes_with_their_absolute_transform() {
        let tree = parse_svg(
            br#"<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10 20)"><rect width="4" height="3"/></g></svg>"#,
        )
        .expect("valid SVG must parse");
        let polygons = polygonize(&tree, 0.1).expect("geometry must be finite");
        assert_eq!(polygons.len(), 1);
        assert_eq!(polygons[0].source, 0);
        assert_eq!(
            polygons[0].points,
            vec![10.0, 20.0, 14.0, 20.0, 14.0, 23.0, 10.0, 23.0]
        );
    }

    #[test]
    fn polygonizes_each_compound_path_contour_independently() {
        let tree = parse_svg(
            br#"<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H2V2ZM10 10H12V12Z"/></svg>"#,
        )
        .expect("valid SVG must parse");
        let polygons = polygonize(&tree, 0.1).expect("geometry must be finite");
        assert_eq!(polygons.len(), 2);
        assert_eq!(polygons[0].source, 0);
        assert_eq!(polygons[1].source, 1);
    }

    #[test]
    fn serializes_a_stable_plugin_payload() {
        let tree =
            parse_svg(br#"<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H2V2Z"/></svg>"#)
                .expect("valid SVG must parse");
        let polygons = polygonize(&tree, 0.1).expect("geometry must be finite");
        let payload = polygons_binary(&polygons);
        assert_eq!(&payload[..8], b"SNP2\x01\0\0\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 0);
        assert_eq!(u32::from_le_bytes(payload[12..16].try_into().unwrap()), 6);
    }

    #[test]
    fn renders_placed_sources_without_a_browser() {
        let tree = parse_svg(
            br##"<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="3" fill="#ff0000"/></svg>"##,
        )
        .expect("valid SVG must parse");
        let sources = source_fragments(&tree).expect("source SVG must serialize");
        let request = OutputRequest {
            placements: vec![vec![Placement {
                id: 0,
                x: 12.0,
                y: 4.0,
                rotation: 90.0,
            }]],
            tree: vec![TreeNode {
                source: Some(0),
                children: vec![],
            }],
            bin_bounds: Bounds {
                x: 0.0,
                y: 0.0,
                width: 40.0,
                height: 20.0,
            },
            bin_source: 0,
        };
        let documents = output_documents(&request, &sources);
        let document = &documents[0];
        assert!(document.contains("viewBox=\"0 0 40 20\""));
        assert!(document.contains("translate(12 4) rotate(90)"));
        assert!(document.contains("fill=\"#ff0000\""));
        let payload = svg_documents_binary(&["<svg/>".to_owned()]);
        assert_eq!(&payload[..8], b"SNP3\x01\0\0\0");
        assert_eq!(u32::from_le_bytes(payload[8..12].try_into().unwrap()), 6);
        assert_eq!(&payload[12..], b"<svg/>");
    }

    #[test]
    fn decodes_the_format_plugin_binary_placement_payload() {
        let mut placement = b"SNP1".to_vec();
        let u32 = |value: u32, output: &mut Vec<u8>| output.extend(value.to_le_bytes());
        let f64 = |value: f64, output: &mut Vec<u8>| output.extend(value.to_le_bytes());

        u32(0, &mut placement); // bin source
        f64(0.0, &mut placement);
        f64(0.0, &mut placement);
        f64(40.0, &mut placement);
        f64(20.0, &mut placement);
        u32(1, &mut placement); // tree count
        placement.push(1); // node has a source
        u32(0, &mut placement);
        u32(0, &mut placement); // no children
        u32(1, &mut placement); // sheet count
        u32(1, &mut placement); // placement count
        u32(0, &mut placement);
        f64(12.0, &mut placement);
        f64(4.0, &mut placement);
        f64(90.0, &mut placement);

        let documents = core_output_documents(
            br#"<svg xmlns="http://www.w3.org/2000/svg"><rect width="2" height="3"/></svg>"#,
            &placement,
        )
        .expect("format-plugin payload should decode");
        assert_eq!(documents.len(), 1);
        assert!(documents[0].contains("translate(12 4) rotate(90)"));
    }

    #[test]
    fn display_svg_marks_every_selectable_source() {
        let tree = parse_svg(
            br#"<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><path d="M0 0H2V2Z M5 5H7V7Z"/></svg>"#,
        )
        .expect("valid SVG must parse");
        let display = display_svg(&tree).expect("display SVG");
        assert!(display.contains("data-svgnest-source=\"0\""));
        assert!(display.contains("data-svgnest-source=\"1\""));
    }
}
