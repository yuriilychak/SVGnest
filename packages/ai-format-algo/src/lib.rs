//! Adobe Illustrator byte-format detection for the SVGnest AI plugin.

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn detect_ai_format(input: &[u8]) -> String {
    let prefix = &input[..input.len().min(1024)];
    if prefix.starts_with(b"%PDF-") {
        "pdf-compatible".into()
    } else if prefix.starts_with(b"%!PS-Adobe-") {
        "legacy-eps".into()
    } else {
        "unknown".into()
    }
}

#[cfg(test)]
mod tests {
    use super::detect_ai_format;

    #[test]
    fn detects_pdf_compatible_ai() { assert_eq!(detect_ai_format(b"%PDF-1.7"), "pdf-compatible"); }

    #[test]
    fn detects_legacy_eps_ai() { assert_eq!(detect_ai_format(b"%!PS-Adobe-3.0"), "legacy-eps"); }
}
