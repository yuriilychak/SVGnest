//! Adobe Illustrator byte-format detection for the SVGnest AI plugin.

use wasm_bindgen::prelude::*;
use kurbo::PathEl;

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

#[cfg(test)]
mod tests {
    use super::detect_ai_format;

    #[test]
    fn detects_pdf_compatible_ai() { assert_eq!(detect_ai_format(b"%PDF-1.7"), "pdf-compatible"); }

    #[test]
    fn detects_legacy_eps_ai() { assert_eq!(detect_ai_format(b"%!PS-Adobe-3.0"), "legacy-eps"); }
}
