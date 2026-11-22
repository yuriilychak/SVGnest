//! Adobe Illustrator byte-format detection for the SVGnest AI plugin.

use wasm_bindgen::prelude::*;

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

#[cfg(test)]
mod tests {
    use super::detect_ai_format;

    #[test]
    fn detects_pdf_compatible_ai() { assert_eq!(detect_ai_format(b"%PDF-1.7"), "pdf-compatible"); }

    #[test]
    fn detects_legacy_eps_ai() { assert_eq!(detect_ai_format(b"%!PS-Adobe-3.0"), "legacy-eps"); }
}
