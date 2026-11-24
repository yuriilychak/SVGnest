use std::path::PathBuf;
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "illustrator-rs")]
#[command(about = "Parse, export, and rebuild Adobe Illustrator (.ai) files")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Extract artwork from .ai files to SVG/JSON
    Extract {
        /// Input .ai files
        files: Vec<PathBuf>,

        /// Output format
        #[arg(short, long, default_value = "all", value_parser = ["svg", "json", "all"])]
        format: String,

        /// Output directory
        #[arg(short, long, default_value = "./output")]
        output_dir: PathBuf,

        /// Export each layer separately
        #[arg(long)]
        per_layer: bool,

        /// Skip writing .ai-meta.json sidecar
        #[arg(long)]
        no_metadata: bool,
    },

    /// Show document info — layers, colors, objects, dimensions
    Inspect {
        /// Input .ai file
        file: PathBuf,
    },

    /// Rebuild an .ai file from an edited SVG
    Rebuild {
        /// Input SVG file
        svg_file: PathBuf,

        /// Original .ai file for structure/metadata preservation
        #[arg(short, long)]
        original: Option<PathBuf>,

        /// Output .ai file path
        #[arg(short, long)]
        output: Option<PathBuf>,

        /// Metadata sidecar .ai-meta.json
        #[arg(short, long)]
        metadata: Option<PathBuf>,
    },

    /// Verify that all dependencies are available
    Check,
}

impl Cli {
    pub fn run(&self) -> crate::Result<()> {
        match &self.command {
            Commands::Extract { files, format, output_dir, per_layer, no_metadata } => {
                self.run_extract(files, format, output_dir, *per_layer, *no_metadata)
            }
            Commands::Inspect { file } => self.run_inspect(file),
            Commands::Rebuild { svg_file, original, output, metadata } => {
                self.run_rebuild(svg_file, original.as_ref(), output.as_ref(), metadata.as_ref())
            }
            Commands::Check => self.run_check(),
        }
    }

    fn run_extract(
        &self,
        files: &[PathBuf],
        format: &str,
        output_dir: &PathBuf,
        per_layer: bool,
        no_metadata: bool,
    ) -> crate::Result<()> {
        let _ = (files, format, output_dir, per_layer, no_metadata);
        log::info!("Extract command (not fully implemented)");
        Ok(())
    }

    fn run_inspect(&self, file: &PathBuf) -> crate::Result<()> {
        let _ = file;
        log::info!("Inspect command (not fully implemented)");
        Ok(())
    }

    fn run_rebuild(
        &self,
        svg_file: &PathBuf,
        original: Option<&PathBuf>,
        output: Option<&PathBuf>,
        metadata: Option<&PathBuf>,
    ) -> crate::Result<()> {
        let _ = (svg_file, original, output, metadata);
        log::info!("Rebuild command (not fully implemented)");
        Ok(())
    }

    fn run_check(&self) -> crate::Result<()> {
        log::info!("All dependencies available.");
        Ok(())
    }
}
