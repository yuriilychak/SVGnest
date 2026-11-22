use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Container error: {0}")]
    Container(String),
    #[error("Lexer error: {0}")]
    Lexer(String),
    #[error("Export error: {0}")]
    Export(String),
    #[error("Import error: {0}")]
    Import(String),
    #[error("Security violation: {0}")]
    Security(String),
    #[error("SVG path error: {0}")]
    SvgPath(String),
    #[error("PDF error: {0}")]
    Pdf(String),
    #[error("Zstandard error: {0}")]
    Zstd(String),
    #[error("Metadata error: {0}")]
    Metadata(String),
    #[error("ICC error: {0}")]
    Icc(String),
    #[error("Unsupported: {0}")]
    Unsupported(String),
}
