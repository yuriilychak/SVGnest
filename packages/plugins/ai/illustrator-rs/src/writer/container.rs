use std::path::Path;

use crate::error::{Error, Result};
use crate::export::metadata::AiMetadata;
use crate::parser::container::AiContainer;

const DEFAULT_CHUNK_SIZE: usize = 64 * 1024;

pub struct ContainerBuilder {
    pgf_source: String,
    metadata: Option<AiMetadata>,
}

impl ContainerBuilder {
    pub fn new(pgf_source: String, metadata: Option<AiMetadata>) -> Self {
        ContainerBuilder {
            pgf_source,
            metadata,
        }
    }

    pub fn build(
        &self,
        output_path: &Path,
        original_ai_path: Option<&Path>,
    ) -> Result<()> {
        if let Some(orig) = original_ai_path
            && orig.exists() {
                return self.build_from_original(output_path, orig);
            }
        self.build_minimal(output_path)
    }

    fn build_from_original(&self, output_path: &Path, original_path: &Path) -> Result<()> {
        if self.pgf_matches_original(original_path) {
            std::fs::copy(original_path, output_path)?;
            return Ok(());
        }

        let original_bytes = std::fs::read(original_path)?;
        let original_text = latin1_decode(&original_bytes);

        let start_markers = ["%AI5_BeginLayer", "%%EndSetup", "%AI5_"];
        let content_start = start_markers
            .iter()
            .filter_map(|m| original_text.find(m))
            .min()
            .ok_or_else(|| {
                Error::Container("No PGF content markers found in original file".to_string())
            })?;

        let content_after_start = &original_text[content_start..];
        let eof_pos = content_after_start
            .find("%%EOF")
            .ok_or_else(|| Error::Container("No %%EOF found in original file".to_string()))?;

        let pgf_bytes = self.pgf_source.as_bytes();
        let chunks = chunk_pgf_data(pgf_bytes, DEFAULT_CHUNK_SIZE);

        let chunked_pgf = if chunks.len() <= 1 {
            self.pgf_source.clone()
        } else {
            let mut combined = String::new();
            for (i, chunk) in chunks.iter().enumerate() {
                let chunk_text = String::from_utf8_lossy(chunk);
                if i > 0 {
                    combined.push('\n');
                }
                combined.push_str(&chunk_text);
            }
            combined
        };

        let mut result = String::with_capacity(
            content_start + chunked_pgf.len() + (original_bytes.len() - content_start - eof_pos),
        );
        result.push_str(&original_text[..content_start]);
        result.push_str(&chunked_pgf);
        result.push_str(&original_text[content_start + eof_pos..]);

        std::fs::write(output_path, result.as_bytes())?;
        Ok(())
    }

    fn build_minimal(&self, output_path: &Path) -> Result<()> {
		std::fs::write(output_path, self.build_minimal_bytes()?)?;
		Ok(())
	}

	/// Build a minimal PDF-compatible AI container without filesystem access.
	pub fn build_minimal_bytes(&self) -> Result<Vec<u8>> {
        let pgf_bytes = self.pgf_source.as_bytes();
        let chunks = chunk_pgf_data(pgf_bytes, DEFAULT_CHUNK_SIZE);
        let preview = pdf_preview_stream(&self.pgf_source);

        let (width, height) = self
            .metadata
            .as_ref()
            .map(|m| {
                let w = if m.bounding_box[2] > 0.0 {
                    m.bounding_box[2]
                } else {
                    612.0
                };
                let h = if m.bounding_box[3] > 0.0 {
                    m.bounding_box[3]
                } else {
                    792.0
                };
                (w as i64, h as i64)
            })
            .unwrap_or((612, 792));

        let mut objects = Vec::new();
        let mut stream_obj_numbers = Vec::new();
        let mut next_obj = 1;

        objects.push(format!("{next_obj} 0 obj\n<< /Type /Catalog /Pages {} 0 R >>\nendobj", next_obj + 1));
        next_obj += 1;
        let pages_obj = next_obj;

        objects.push(format!("{next_obj} 0 obj\n<< /Type /Pages /Kids [{} 0 R] /Count 1 >>\nendobj", next_obj + 1));
        next_obj += 1;
        let page_obj = next_obj;
        next_obj += 1;
        let preview_obj = next_obj;

        let mut private_refs = String::new();
        for (i, _) in chunks.iter().enumerate() {
            next_obj += 1;
            stream_obj_numbers.push(next_obj);
            if i > 0 {
                private_refs.push(' ');
            }
            private_refs.push_str(&format!("/AIPrivateData{} {} 0 R", i + 1, next_obj));
        }

        objects.push(format!(
            "{page_obj} 0 obj\n\
             << /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {width} {height}] /Contents {preview_obj} 0 R \
             /PieceInfo << /Illustrator << /Private << {private_refs} >> >> >> >>\n\
             endobj"
        ));

        let mut xref_offsets = Vec::new();
        let mut pdf_bytes = Vec::new();

        pdf_bytes.extend_from_slice(b"%PDF-1.5\n");

        for obj_str in objects.iter() {
            xref_offsets.push(pdf_bytes.len());
            pdf_bytes.extend_from_slice(obj_str.as_bytes());
            pdf_bytes.push(b'\n');
        }

        xref_offsets.push(pdf_bytes.len());
        let preview_len = preview.len();
        pdf_bytes.extend_from_slice(
            format!("{preview_obj} 0 obj\n<< /Length {preview_len} >>\nstream\n{preview}endstream\nendobj\n")
                .as_bytes(),
        );

        for (i, &obj_num) in stream_obj_numbers.iter().enumerate() {
            xref_offsets.push(pdf_bytes.len());
            let chunk_len = chunks[i].len();
            let obj_text = format!(
                "{obj_num} 0 obj\n<< /Length {chunk_len} >>\nstream\n{}endstream\nendobj\n",
                String::from_utf8_lossy(&chunks[i])
            );
            pdf_bytes.extend_from_slice(obj_text.as_bytes());
        }

        let xref_offset = pdf_bytes.len();

        let xref_str = format!(
            "xref\n0 {}\n\
             0000000000 65535 f \n\
             {}\
             trailer\n\
             << /Size {} /Root 1 0 R >>\n\
             startxref\n\
             {xref_offset}\n\
             %%EOF\n",
            stream_obj_numbers.len() + objects.len() + 1,
            xref_offsets
                .iter()
                // A PDF cross-reference table consists of fixed-width *lines*.
                // Keeping entries on one line leaves the offset table malformed,
                // which makes PDF-compatible AI files fail to open even when the
                // embedded Illustrator private stream is otherwise valid.
                .map(|o| format!("{o:010} 00000 n \n"))
                .collect::<String>(),
            stream_obj_numbers.len() + objects.len() + 1,
        );
        pdf_bytes.extend_from_slice(xref_str.as_bytes());

        Ok(pdf_bytes)
    }

    fn pgf_matches_original(&self, original_path: &Path) -> bool {
        match AiContainer::new(original_path.to_path_buf()).extract() {
            Ok(original_pgf) => original_pgf == self.pgf_source,
            Err(_) => false,
        }
    }
}

/// Illustrator's private stream uses a few AI-specific operators.  Keep it
/// intact for Illustrator, while translating the ordinary path subset into a
/// PDF page-content stream so exported AI files are visible in PDF viewers
/// and thumbnail generators too.
fn pdf_preview_stream(pgf: &str) -> String {
    let mut preview = String::from("q\n");
    for line in pgf.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('%') || line.ends_with(" Lb") || line.ends_with(" Ln") || line == "LB" {
            continue;
        }
        match line {
            "u" | "*u" => preview.push_str("q\n"),
            "U" | "*U" => preview.push_str("Q\n"),
            _ if line.ends_with(" Xa") => {
                preview.push_str(line.trim_end_matches(" Xa"));
                preview.push_str(" rg\n");
            }
            _ if line.ends_with(" XA") => {
                preview.push_str(line.trim_end_matches(" XA"));
                preview.push_str(" RG\n");
            }
            _ => {
                preview.push_str(line);
                preview.push('\n');
            }
        }
    }
    preview.push_str("Q\n");
    preview
}

fn chunk_pgf_data(data: &[u8], chunk_size: usize) -> Vec<Vec<u8>> {
    let total = data.len();
    if total <= chunk_size {
        return vec![data.to_vec()];
    }
    let mut chunks = Vec::new();
    let mut offset = 0;
    while offset < total {
        let end = (offset + chunk_size).min(total);
        chunks.push(data[offset..end].to_vec());
        offset = end;
    }
    chunks
}

fn latin1_decode(data: &[u8]) -> String {
    data.iter().map(|&b| b as char).collect()
}

pub fn build_ai(
    pgf_source: String,
    output_path: &Path,
    original_path: Option<&Path>,
    metadata: Option<AiMetadata>,
) -> Result<()> {
    let builder = ContainerBuilder::new(pgf_source, metadata);
    builder.build(output_path, original_path)
}

/// Build a new PDF-compatible Illustrator file entirely in memory.
pub fn build_ai_bytes(pgf_source: String, metadata: Option<AiMetadata>) -> Result<Vec<u8>> {
	ContainerBuilder::new(pgf_source, metadata).build_minimal_bytes()
}

#[cfg(test)]
mod tests {
    use super::build_ai_bytes;

    #[test]
    fn minimal_pdf_uses_one_fixed_width_xref_entry_per_object() {
        let bytes = build_ai_bytes("%AI5_BeginLayer\n%AI5_EndLayer--\n".into(), None)
            .expect("minimal AI container should build");
        let pdf = String::from_utf8(bytes).expect("test container is UTF-8");
        let xref = pdf.split("xref\n0 ").nth(1).expect("xref table");
        let mut lines = xref.lines();
        let object_count: usize = lines
            .next()
            .expect("xref object count")
            .parse()
            .expect("numeric xref object count");

        for _ in 0..object_count {
            let entry = lines.next().expect("one xref line per object");
            assert_eq!(entry.len(), 19, "xref entries must be fixed width");
        }
        assert_eq!(lines.next(), Some("trailer"));
    }

    #[test]
    fn minimal_pdf_closes_the_page_dictionary_before_private_streams() {
        let bytes = build_ai_bytes("%AI5_BeginLayer\n%AI5_EndLayer--\n".into(), None)
            .expect("minimal AI container should build");
        let pdf = String::from_utf8(bytes).expect("test container is UTF-8");
        assert!(pdf.contains(
            "/PieceInfo << /Illustrator << /Private << /AIPrivateData1 4 0 R >> >> >> >>\nendobj"
        ));
    }
}
