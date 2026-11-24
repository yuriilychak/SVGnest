//! Adobe Illustrator byte-format detection for the SVGnest AI plugin.

use wasm_bindgen::prelude::*;
use illustrator_rs::{AiDocument, AiObject, CmykColor, Color};

/// Converts supported vector paths into normalized SVG. Images and advanced
/// paints are intentionally omitted from this first geometry-only bridge.
#[wasm_bindgen]
pub fn input_to_svg(input: &[u8]) -> Result<String, JsValue> {
	input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))
}
fn input_to_svg_core(input: &[u8]) -> Result<String, String> {
	pdf_to_svg(input).map_err(|error| format!("Unable to convert PDF-compatible Illustrator artwork: {error}"))
}

/// Converts the visible PDF artwork into the normalized SVG consumed by the
/// format-plugin contract. `core_input_to_svg` assigns stable source IDs after
/// zpdf has interpreted PDF operators, transforms, clipping, and paint.
fn pdf_to_svg(input: &[u8]) -> Result<String, String> {
	let document = zpdf::PdfDocument::open(input.to_vec()).map_err(|error| error.to_string())?;
	let page = zpdf::interpret_page(&document, 0, zpdf::PageInterpretOptions::default())
		.map_err(|error| error.to_string())?;
	page.ensure_complete().map_err(|error| error.to_string())?;
	let svg = zpdf_svg_export::display_list_to_svg(
		&page.display_list,
		&page.fonts,
		&page.images,
		&zpdf_svg_export::SvgOptions { background: None, ..Default::default() },
	);
	svg_format_core::core_input_to_svg(svg.as_bytes())
}

#[wasm_bindgen]
pub fn input_to_polygons(input: &[u8], tolerance: f64) -> Result<Vec<u8>, JsValue> {
	let svg = input_to_svg_core(input).map_err(|error| JsValue::from_str(&error))?;
	svg_format_core::core_input_to_polygons(svg.as_bytes(), tolerance)
		.map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen]
pub fn output_to_svg(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, JsValue> {
	output_to_svg_core(input, placement_data).map_err(|error| JsValue::from_str(&error))
}

fn output_to_svg_core(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, String> {
	let svg = input_to_svg_core(input)?;
	svg_format_core::core_output_to_svg(svg.as_bytes(), placement_data)
}

#[wasm_bindgen]
pub fn output_to_data(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, JsValue> {
	output_to_data_core(input, placement_data).map_err(|error| JsValue::from_str(&error))
}

fn output_to_data_core(input: &[u8], placement_data: &[u8]) -> Result<Vec<u8>, String> {
	let source_svg = input_to_svg_core(input)?;
	let documents = svg_format_core::core_output_documents(source_svg.as_bytes(), placement_data)
		?;
	let svg = documents.first().ok_or("No output document was generated")?;
	let mut document = illustrator_rs::importer::svg::import_svg_string(svg, None)
		.map_err(|error| error.to_string())?;
	set_missing_fills_to_black(&mut document);
	let pgf = illustrator_rs::writer::pgf::write_pgf(&document, None)
		.map_err(|error| error.to_string())?;
	illustrator_rs::writer::container::build_ai_bytes(pgf, None)
		.map_err(|error| error.to_string())
}

fn set_missing_fills_to_black(document: &mut AiDocument) {
	let black = || Color::Cmyk(CmykColor { cyan: 0.0, magenta: 0.0, yellow: 0.0, black: 1.0 });
	fn visit(object: &mut AiObject, black: &impl Fn() -> Color) {
		match object {
			AiObject::Path(path) if !path.clip && path.fill.is_none() => path.fill = Some(black()),
			AiObject::Group(group) => for child in &mut group.children { visit(child, black); },
			AiObject::CompoundPath(compound) => {
				if compound.fill.is_none() { compound.fill = Some(black()); }
				for path in &mut compound.subpaths {
					if !path.clip && path.fill.is_none() { path.fill = Some(black()); }
				}
			}
			_ => {}
		}
	}
	for layer in &mut document.layers {
		for object in &mut layer.children { visit(object, &black); }
	}
}
