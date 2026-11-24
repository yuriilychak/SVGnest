use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{Error, Result};
use crate::model::*;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AiMetadata {
    pub format: String,
    pub version: String,
    pub color_mode: String,
    pub bounding_box: [f64; 4],
    pub title: String,
    pub creator: String,
    pub fonts_used: Vec<String>,
    pub spot_colors: Vec<Value>,
    pub metadata: HashMap<String, String>,
    pub prolog_data: Option<String>,
    pub trailer_data: Option<String>,
    pub color_hex_map: HashMap<String, Value>,
    pub layer_pgf: Vec<LayerPgfEntry>,
    pub pgf_hash: String,
    pub trusted: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LayerPgfEntry {
    pub name: String,
    pub pgf: String,
}

pub fn extract_metadata(document: &AiDocument, pgf_source: &str) -> AiMetadata {
    let bbox = document.bounding_box.as_ref().map(|b| [b.x, b.y, b.width, b.height]).unwrap_or([0.0, 0.0, 612.0, 792.0]);

    let mut color_hex_map: HashMap<String, Value> = HashMap::new();
    let mut spot_colors: Vec<Value> = Vec::new();

    for sc in &document.spot_colors {
        let entry = json!({
            "name": sc.name,
            "cyan": sc.cyan,
            "magenta": sc.magenta,
            "yellow": sc.yellow,
            "black": sc.black,
        });
        spot_colors.push(entry.clone());
        color_hex_map.insert(sc.to_hex(), entry);
    }

    for color in document.collect_colors() {
        let hex_val = color.to_hex();
        if color_hex_map.contains_key(&hex_val) {
            continue;
        }
        match &color {
            Color::Cmyk(c) => {
                color_hex_map.insert(hex_val, json!({
                    "type": "cmyk",
                    "cyan": c.cyan,
                    "magenta": c.magenta,
                    "yellow": c.yellow,
                    "black": c.black,
                }));
            }
            Color::Gray(c) => {
                color_hex_map.insert(hex_val, json!({
                    "type": "gray",
                    "gray": c.gray,
                }));
            }
            Color::Spot(sc) => {
                color_hex_map.insert(hex_val, json!({
                    "type": "spot",
                    "name": sc.name,
                    "cyan": sc.cyan,
                    "magenta": sc.magenta,
                    "yellow": sc.yellow,
                    "black": sc.black,
                    "tint": sc.tint,
                }));
            }
            _ => {}
        }
    }

    let layer_marker = "%AI5_BeginLayer";
    let end_marker = "%AI5_EndLayer--";
    let layer_pos = pgf_source.find(layer_marker);
    let prolog_data = layer_pos.map(|pos| pgf_source[..pos].to_string());

    let last_layer_end = pgf_source.rfind(end_marker);
    let trailer_data = last_layer_end.map(|pos| {
        let start = pos + end_marker.len();
        pgf_source[start..].trim().to_string()
    });

    let layer_pgf = extract_layer_pgf(pgf_source, document);

    let pgf_hash = pgf_source.len().to_string();

    AiMetadata {
        format: "pdf".to_string(),
        version: document.version.clone(),
        color_mode: document.color_mode.clone(),
        bounding_box: bbox,
        title: document.title.clone(),
        creator: document.creator.clone(),
        fonts_used: document.fonts_used.clone(),
        spot_colors,
        metadata: document.metadata.clone(),
        prolog_data,
        trailer_data,
        color_hex_map,
        layer_pgf,
        pgf_hash,
        trusted: true,
    }
}

fn extract_layer_pgf(pgf_source: &str, document: &AiDocument) -> Vec<LayerPgfEntry> {
    let mut layers = Vec::new();
    let mut pos = 0;
    let mut layer_idx = 0;

    while let Some(rel_start) = pgf_source[pos..].find("%AI5_BeginLayer") {
        let start = pos + rel_start;
        let rel_end = match pgf_source[start..].find("%AI5_EndLayer--") {
            Some(e) => e,
            None => break,
        };
        let end = start + rel_end + "%AI5_EndLayer--".len();

        let name = document
            .layers
            .get(layer_idx)
            .map(|l| l.name.clone())
            .unwrap_or_default();

        layers.push(LayerPgfEntry {
            name,
            pgf: pgf_source[start..end].to_string(),
        });

        pos = end;
        layer_idx += 1;
    }

    layers
}

pub fn save_metadata(meta: &AiMetadata, output_path: &Path) -> Result<()> {
    let json_str = serde_json::to_string_pretty(meta)
        .map_err(|e| Error::Metadata(format!("Failed to serialize metadata: {}", e)))?;
    std::fs::write(output_path, json_str).map_err(|e| Error::Metadata(format!("Failed to write metadata: {}", e)))?;
    Ok(())
}

const MAX_SIDECAR_BYTES: u64 = 100 * 1024 * 1024;

pub fn load_metadata(meta_path: &Path) -> Result<AiMetadata> {
    let size = std::fs::metadata(meta_path)
        .map_err(|e| Error::Metadata(format!("Failed to read metadata file: {}", e)))?
        .len();
    if size > MAX_SIDECAR_BYTES {
        return Err(Error::Metadata(format!(
            "Metadata sidecar too large: {} bytes (limit {})",
            size, MAX_SIDECAR_BYTES
        )));
    }
    let content = std::fs::read_to_string(meta_path)
        .map_err(|e| Error::Metadata(format!("Failed to read metadata: {}", e)))?;
    let mut meta: AiMetadata = serde_json::from_str(&content)
        .map_err(|e| Error::Metadata(format!("Failed to parse metadata: {}", e)))?;
    meta.trusted = false;
    Ok(meta)
}
