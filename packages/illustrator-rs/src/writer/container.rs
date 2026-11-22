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
        let pgf_bytes = self.pgf_source.as_bytes();
        let chunks = chunk_pgf_data(pgf_bytes, DEFAULT_CHUNK_SIZE);

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
             << /Type /Page /Parent {pages_obj} 0 R /MediaBox [0 0 {width} {height}] \
             /PieceInfo << /Illustrator << /Private << {private_refs} >> >> >>\n\
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
                .map(|o| format!("{o:010} 00000 n "))
                .collect::<String>(),
            stream_obj_numbers.len() + objects.len() + 1,
        );
        pdf_bytes.extend_from_slice(xref_str.as_bytes());

        std::fs::write(output_path, &pdf_bytes)?;
        Ok(())
    }

    fn pgf_matches_original(&self, original_path: &Path) -> bool {
        match AiContainer::new(original_path.to_path_buf()).extract() {
            Ok(original_pgf) => original_pgf == self.pgf_source,
            Err(_) => false,
        }
    }
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
