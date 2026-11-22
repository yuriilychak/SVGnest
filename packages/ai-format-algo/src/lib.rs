//! Adobe Illustrator byte-format detection for the SVGnest AI plugin.

use wasm_bindgen::prelude::*;
use kurbo::PathEl;
use serde::Deserialize;

#[derive(Deserialize)]
struct SvgDocuments { documents: Vec<String> }

#[wasm_bindgen]
pub fn detect_ai_format(input: &[u8]) -> String {
	match effectcraft_pdf::sniff(input) {
		Some(effectcraft_pdf::Format::Pdf) => "pdf-compatible".into(),
		Some(effectcraft_pdf::Format::Eps) => "legacy-eps".into(),
		None => "unknown".into(),
	}
}

/// Parses an AI container to verify that its vector content is supported.
/// SVG conversion will be added once the render-tree-to-SVG bridge is defined.
#[wasm_bindgen]
pub fn validate_ai(input: &[u8]) -> Result<String, JsValue> {
	let format = detect_ai_format(input);
	if format == "unknown" {
		return Err(JsValue::from_str("Unsupported Adobe Illustrator container"));
	}
	effectcraft_pdf::parse(input)
		.map_err(|error| JsValue::from_str(&format!("Unable to parse Adobe Illustrator artwork: {error}")))?;
	Ok(format)
}

/// Converts supported vector paths into normalized SVG. Images and advanced
/// paints are intentionally omitted from this first geometry-only bridge.
#[wasm_bindgen]
pub fn input_to_svg(input: &[u8]) -> Result<String, JsValue> {
	let doc = effectcraft_pdf::parse(input)
		.map_err(|error| JsValue::from_str(&format!("Unable to parse Adobe Illustrator artwork: {error}")))?;
	let mut body = String::new();
	for (transform, _opacity, shape) in doc.flatten() {
		let mut d = String::new();
		for element in shape.geom.to_path().elements() {
			match element {
				PathEl::MoveTo(point) => { let point = transform * *point; d.push_str(&format!("M{} {}", point.x, point.y)); }
				PathEl::LineTo(point) => { let point = transform * *point; d.push_str(&format!("L{} {}", point.x, point.y)); }
				PathEl::QuadTo(control, point) => { let control = transform * *control; let point = transform * *point; d.push_str(&format!("Q{} {} {} {}", control.x, control.y, point.x, point.y)); }
				PathEl::CurveTo(a, b, point) => { let a = transform * *a; let b = transform * *b; let point = transform * *point; d.push_str(&format!("C{} {} {} {} {} {}", a.x, a.y, b.x, b.y, point.x, point.y)); }
				PathEl::ClosePath => d.push('Z'),
			}
		}
		if !d.is_empty() { body.push_str(&format!("<path d=\"{d}\" fill=\"black\"/>")); }
	}
	Ok(format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\">{body}</svg>", doc.width, doc.height))
}

/// Experimental native Illustrator parser path, retained separately until it
/// passes the browser/WASM fixture corpus used by the production adapter.
#[wasm_bindgen]
pub fn input_to_svg_illustrator(input: &[u8]) -> Result<String, JsValue> {
	let pgf = illustrator_rs::parser::container::extract_pgf_bytes(input)
		.map_err(|error| JsValue::from_str(&error.to_string()))?;
	let tokens = illustrator_rs::parser::lexer::tokenize(&pgf)
		.map_err(|error| JsValue::from_str(&error.to_string()))?;
	let document = illustrator_rs::parser::ai_parser::parse_ai(tokens)
		.map_err(|error| JsValue::from_str(&error.to_string()))?;
	illustrator_rs::export::svg::export_svg(&document)
		.map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn input_to_polygons(input: &[u8], tolerance: f64) -> Result<String, JsValue> {
	let svg = input_to_svg(input)?;
	svg_format_algo::core_input_to_polygons(svg.as_bytes(), tolerance)
		.map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn output_to_svg(input: &[u8], placement_json: &str) -> Result<String, JsValue> {
	let svg = input_to_svg(input)?;
	svg_format_algo::core_output_to_svg(svg.as_bytes(), placement_json)
		.map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn output_to_data(input: &[u8], placement_json: &str) -> Result<Vec<u8>, JsValue> {
	let documents: SvgDocuments = serde_json::from_str(&output_to_svg(input, placement_json)?)
		.map_err(|error| JsValue::from_str(&format!("Invalid placed SVG output: {error}")))?;
	let svg = documents.documents.first().ok_or_else(|| JsValue::from_str("No output document was generated"))?;
	let document = illustrator_rs::importer::svg::import_svg_string(svg, None)
		.map_err(|error| JsValue::from_str(&error.to_string()))?;
	let pgf = illustrator_rs::writer::pgf::write_pgf(&document, None)
		.map_err(|error| JsValue::from_str(&error.to_string()))?;
	illustrator_rs::writer::container::build_ai_bytes(pgf, None)
		.map_err(|error| JsValue::from_str(&error.to_string()))
}


#[cfg(test)]
mod tests {
    use super::{detect_ai_format, input_to_svg, output_to_data};

    #[test]
    fn detects_pdf_compatible_ai() { assert_eq!(detect_ai_format(b"%PDF-1.7"), "pdf-compatible"); }

    #[test]
    fn detects_legacy_eps_ai() { assert_eq!(detect_ai_format(b"%!PS-Adobe-3.0"), "legacy-eps"); }

    #[test]
    fn converts_legacy_eps_path_to_svg() {
        let eps = b"%!PS-Adobe-3.0\n%%BoundingBox: 0 0 100 100\nnewpath 10 10 moveto 90 10 lineto 90 90 lineto closepath fill\nshowpage\n";
        let svg = input_to_svg(eps).expect("EPS path should convert");
        assert!(svg.contains("<path"));
    }

    #[test]
    fn writes_pdf_compatible_ai_bytes() {
        let eps = b"%!PS-Adobe-3.0\n%%BoundingBox: 0 0 100 100\nnewpath 10 10 moveto 90 10 lineto 90 90 lineto closepath fill\nshowpage\n";
        let placement = r#"{"placements":[[{"id":0,"x":0,"y":0,"rotation":0}]],"tree":[{"source":0,"children":[]}],"binBounds":{"x":0,"y":0,"width":100,"height":100},"binSource":0}"#;
        let bytes = output_to_data(eps, placement).expect("AI export should succeed");
        assert!(bytes.starts_with(b"%PDF-"));
    }
}
