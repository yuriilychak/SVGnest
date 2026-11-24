use std::path::{Path, PathBuf};

use flate2::read::ZlibDecoder;
use std::io::Read;

use crate::error::{Error, Result};

const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_DECOMPRESS_BYTES: usize = 256 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub enum AiFormat {
    Pdf,
    Eps,
    PostScript,
}

pub struct AiContainer {
    pub path: PathBuf,
    pub format: AiFormat,
}

impl AiContainer {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        AiContainer {
            path: path.into(),
            format: AiFormat::PostScript,
        }
    }

    pub fn extract(&self) -> Result<String> {
        extract_pgf(&self.path)
    }
}

pub fn extract_pgf(path: &Path) -> Result<String> {
    let file_size = std::fs::metadata(path)
        .map_err(|e| Error::Container(format!("Cannot access file: {e}")))?
        .len();
    if file_size > MAX_FILE_BYTES {
        return Err(Error::Container(format!(
            "File too large: {} bytes (limit {})",
            file_size, MAX_FILE_BYTES
        )));
    }
    let raw = std::fs::read(path)?;
    extract_pgf_bytes(&raw)
}

/// Extract Illustrator PGF content from an in-memory upload.
///
/// This is the browser/WASM-safe counterpart to [`extract_pgf`].
pub fn extract_pgf_bytes(raw: &[u8]) -> Result<String> {
    if raw.len() as u64 > MAX_FILE_BYTES {
        return Err(Error::Container(format!(
            "File too large: {} bytes (limit {})",
            raw.len(), MAX_FILE_BYTES
        )));
    }
    let format = detect_format(&raw)?;
    match format {
        AiFormat::Pdf => extract_from_pdf(&raw),
        AiFormat::Eps => extract_from_eps(&raw),
        AiFormat::PostScript => extract_from_postscript(&raw),
    }
}

pub fn detect_format(raw: &[u8]) -> Result<AiFormat> {
    let header = &raw[..raw.len().min(32)];
    if header.starts_with(b"%PDF-") {
        Ok(AiFormat::Pdf)
    } else if header.starts_with(b"\xC5\xD0\xD3\xC6") {
        Ok(AiFormat::Eps)
    } else if header.starts_with(b"%!PS-Adobe") {
        let check = &raw[..raw.len().min(2048)];
        let has_bb = check
            .windows(b"%%BoundingBox".len())
            .any(|w| w == b"%%BoundingBox");
        if has_bb {
            Ok(AiFormat::Eps)
        } else {
            Ok(AiFormat::PostScript)
        }
    } else {
        Err(Error::Container(format!(
            "Unrecognized file format. Expected %PDF- or %!PS-Adobe header, got: {:?}",
            &header[..header.len().min(16)]
        )))
    }
}

fn extract_from_pdf(raw: &[u8]) -> Result<String> {
    let text = String::from_utf8_lossy(raw);

    let markers = ["%AI5_BeginLayer", "%%EndSetup"];
    let start_pos = markers.iter().filter_map(|m| text.find(m)).min();
    let start = match start_pos {
        Some(pos) => pos,
        None => {
            if let Some(pos) = text.find("%AI5_") {
                pos
            } else {
                return Err(Error::Container(
                    "No PGF data found in PDF".to_string(),
                ));
            }
        }
    };

    let content = &text[start..];
    let end_markers = ["%%EOF", "%AI5_EndLayer--"];
    let end_pos = end_markers.iter().filter_map(|m| content.find(m)).min();
    let result = match end_pos {
        Some(pos) => content[..pos].to_string(),
        None => content.to_string(),
    };

    decode_pgf(&result)
}

fn extract_from_eps(raw: &[u8]) -> Result<String> {
    let text = if raw.len() >= 4 && raw[..4] == [0xC5, 0xD0, 0xD3, 0xC6] {
        if raw.len() < 12 {
            return Err(Error::Container("Truncated DOS EPS header".to_string()));
        }
        let ps_offset = u32::from_le_bytes(raw[4..8].try_into().unwrap()) as usize;
        let ps_length = u32::from_le_bytes(raw[8..12].try_into().unwrap()) as usize;
        if ps_offset + ps_length > raw.len() {
            return Err(Error::Container("EPS offset/length out of bounds".to_string()));
        }
        String::from_utf8_lossy(&raw[ps_offset..ps_offset + ps_length]).to_string()
    } else {
        String::from_utf8_lossy(raw).to_string()
    };

    let marker = "%AI9_PrivateDataBegin";
    if let Some(marker_pos) = text.find(marker) {
        let private_section = &text[marker_pos + marker.len()..];
        let end_marker = "%AI9_PrivateDataEnd";
        let end_pos = private_section.find(end_marker).unwrap_or(private_section.len());
        let private_data = &private_section[..end_pos];
        return decode_eps_private_data(private_data);
    }

    Ok(extract_script_section(&text))
}

fn decode_eps_private_data(data: &str) -> Result<String> {
    let mut stripped_lines = Vec::new();
    for line in data.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("%%") {
            continue;
        } else if let Some(stripped) = trimmed.strip_prefix('%') {
            stripped_lines.push(stripped);
        } else {
            stripped_lines.push(trimmed);
        }
    }

    let result = stripped_lines.join("\n");

    if result.trim().starts_with("<~") {
        let decoded = decode_ascii85(result.trim())?;
        if decoded.len() >= 2
            && ((decoded[0] == 0x78 && (decoded[1] == 0x9C || decoded[1] == 0x01 || decoded[1] == 0xDA))
                || (decoded.len() > 2 && decoded[0] == 0x78 && decoded[1] == 0x5E))
        {
            let decompressed = safe_zlib_decompress(&decoded, MAX_DECOMPRESS_BYTES)?;
            return Ok(String::from_utf8_lossy(&decompressed).to_string());
        }
        return Ok(String::from_utf8_lossy(&decoded).to_string());
    }

    Ok(result)
}

fn decode_ascii85(data: &str) -> Result<Vec<u8>> {
    let data = data.trim();
    let data = data.strip_prefix("<~").unwrap_or(data);
    let data = data.strip_suffix("~>").unwrap_or(data);

    let clean: String = data.chars().filter(|c| !c.is_whitespace()).collect();
    if clean.is_empty() {
        return Ok(Vec::new());
    }

    let bytes = clean.as_bytes();
    let mut result = Vec::new();
    let mut i = 0;

    while i < bytes.len() {
        if bytes[i] == b'z' {
            result.extend_from_slice(&[0, 0, 0, 0]);
            i += 1;
        } else if bytes[i] == b'~' {
            break;
        } else {
            let remaining = bytes.len() - i;
            let chunk_size = remaining.min(5);
            let mut code: u32 = 0;
            for j in 0..chunk_size {
                let b = bytes[i + j];
                if !(33..=117).contains(&b) {
                    return Err(Error::Container(format!(
                        "Invalid ASCII85 character: {b} ({})",
                        b as char
                    )));
                }
                code = code * 85 + (b - 33) as u32;
            }
            for _ in chunk_size..5 {
                code = code * 85 + 84;
            }
            i += chunk_size;

            if chunk_size < 5 {
                let out_count = chunk_size.saturating_sub(1);
                if out_count > 0 {
                    let be = code.to_be_bytes();
                    result.extend_from_slice(&be[..out_count]);
                }
            } else {
                result.extend_from_slice(&code.to_be_bytes());
            }
        }
    }

    Ok(result)
}

fn extract_from_postscript(raw: &[u8]) -> Result<String> {
    let text = String::from_utf8_lossy(raw).to_string();
    let extracted = extract_script_section(&text);
    decode_pgf(&extracted)
}

pub fn extract_script_section(text: &str) -> String {
    let markers = ["%%EndSetup", "%AI5_BeginLayer", "%%BeginScript"];
    for marker in &markers {
        if let Some(pos) = text.find(marker) {
            return text[pos..].to_string();
        }
    }
    if let Some(pos) = text.find("%%EndProlog") {
        return text[pos..].to_string();
    }
    text.to_string()
}

fn decode_pgf(text: &str) -> Result<String> {
    if text.starts_with("%AI24_ZStandard_Data") {
        #[cfg(feature = "zstd")]
        {
            let raw = text.as_bytes();
            let data = &raw["%AI24_ZStandard_Data".len()..];
            return decode_zstandard(data);
        }
        #[cfg(not(feature = "zstd"))]
        return Err(Error::Container(
            "Zstandard compression requires 'zstd' feature".to_string(),
        ));
    }

    let raw = text.as_bytes();
    if raw.len() >= 2 && (raw[0] == 0x78 && (raw[1] == 0x9C || raw[1] == 0x01 || raw[1] == 0xDA))
    {
        let decompressed = safe_zlib_decompress(raw, MAX_DECOMPRESS_BYTES)?;
        return Ok(String::from_utf8_lossy(&decompressed).to_string());
    }

    expand_ai12_compressed(text)
}

#[cfg(feature = "zstd")]
fn decode_zstandard(data: &[u8]) -> Result<String> {
    use std::io::Read;
    let decoder = zstd::Decoder::new(data)
        .map_err(|e| Error::Zstd(format!("Failed to create zstd decoder: {e}")))?;
    let mut decompressed = Vec::new();
    decoder
        .take(MAX_DECOMPRESS_BYTES as u64)
        .read_to_end(&mut decompressed)
        .map_err(|e| Error::Zstd(format!("Zstandard decompression failed: {e}")))?;
    Ok(String::from_utf8_lossy(&decompressed).to_string())
}

pub fn expand_ai12_compressed(text: &str) -> Result<String> {
    let marker = "%AI12_CompressedData";
    let end_marker = "%AI12_EndCompressedData";

    if let Some(pos) = text.find(marker) {
        let prefix = &text[..pos];
        let compressed_start = pos + marker.len();
        let compressed_bytes = &text.as_bytes()[compressed_start..];

        match safe_zlib_decompress(compressed_bytes, MAX_DECOMPRESS_BYTES) {
            Ok(decompressed) => {
                let mut expanded = String::from_utf8_lossy(&decompressed).to_string();
                if let Some(end_pos) = expanded.find(end_marker) {
                    expanded.truncate(end_pos);
                }
                Ok(prefix.to_string() + &expanded)
            }
            Err(_) => Ok(text.to_string()),
        }
    } else {
        Ok(text.to_string())
    }
}

pub fn safe_zlib_decompress(data: &[u8], max_size: usize) -> Result<Vec<u8>> {
    let decoder = ZlibDecoder::new(data);
    let mut decompressed = Vec::new();
    decoder
        .take(max_size as u64)
        .read_to_end(&mut decompressed)?;
    Ok(decompressed)
}
