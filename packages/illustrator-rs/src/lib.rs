pub mod error;
pub mod icc;

#[cfg(feature = "model")]
pub mod model;

#[cfg(feature = "parser")]
pub mod parser;

#[cfg(feature = "export")]
pub mod export;

#[cfg(feature = "importer")]
pub mod importer;

#[cfg(feature = "writer")]
pub mod writer;

#[cfg(feature = "cli")]
pub mod cli;

#[cfg(feature = "handler")]
pub mod handler;

pub mod prelude {
    pub use crate::error::{Error, Result};
    #[cfg(feature = "model")]
    pub use crate::model::*;
    #[cfg(feature = "parser")]
    pub use crate::parser::container::{extract_pgf, extract_pgf_bytes, AiContainer, AiFormat};
    #[cfg(feature = "parser")]
    pub use crate::parser::lexer::{tokenize, Token, TokenType};
    #[cfg(feature = "parser")]
    pub use crate::parser::ai_parser::{parse_ai, AiParser};
    #[cfg(feature = "export")]
    pub use crate::export::json::export_json;
    #[cfg(feature = "export")]
    pub use crate::export::svg::export_svg;
    #[cfg(feature = "export")]
    pub use crate::export::metadata::{extract_metadata, load_metadata, save_metadata, AiMetadata};
    #[cfg(feature = "importer")]
    pub use crate::importer::svg::import_svg;
    #[cfg(feature = "importer")]
    pub use crate::importer::path::parse_svg_path;
    #[cfg(feature = "writer")]
    pub use crate::writer::pgf::write_pgf;
    #[cfg(feature = "writer")]
    pub use crate::writer::container::{build_ai, build_ai_bytes};
}

pub use error::{Error, Result};

#[cfg(feature = "model")]
pub use model::*;
