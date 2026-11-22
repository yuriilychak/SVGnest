# illustrator-rs

**Pure Rust library for parsing, exporting, editing, and rebuilding Adobe Illustrator `.ai` files — no Illustrator required.**

```toml
[dependencies]
illustrator-rs = "0.1"
```

## What it does

- Parses `.ai` files (PDF-wrapped, EPS, or raw PostScript) into a typed DOM
- Exports to SVG, JSON, or extracts metadata sidecars
- Imports SVG back to the AI document model
- Rebuilds `.ai` files from edited SVGs with CMYK/spot-color preservation
- Handles AI9 through AI24+ formats, including Zstandard and zlib compression
- CLI interface via optional `cli` feature
- Integration-ready for tools like [OfficeCli-rust](https://github.com/Pilser/OfficeCli-rust) via optional `handler` feature

## Library usage

Add to your `Cargo.toml`:

```toml
[dependencies]
illustrator-rs = { version = "0.1", features = ["full"] }
```

Or select only what you need:

```toml
[dependencies]
illustrator-rs = { version = "0.1", features = ["parser", "export"] }
```

### Parse an .ai file

```rust
use illustrator_rs::prelude::*;

fn main() -> Result<()> {
    let document = parse_ai(&tokenize(
        &extract_pgf("design.ai")?
    )?)?;

    println!("Layers: {}", document.layers.len());
    for layer in &document.layers {
        println!("  - {} ({} objects)", layer.name, layer.children.len());
    }
    Ok(())
}
```

### Export to SVG

```rust
let svg = export_svg(&document)?;
std::fs::write("output.svg", svg)?;
```

### Export to JSON

```rust
let json = export_json(&document)?;
std::fs::write("output.json", json)?;
```

### Import SVG back to AI model

```rust
let document = import_svg("edited.svg")?;
let pgf = write_pgf(&document, None)?;
```

### Rebuild .ai from edited SVG (with color preservation)

```rust
use illustrator_rs::export::metadata::{extract_metadata, save_metadata};
use illustrator_rs::writer::container::build_ai;

let pgf = extract_pgf("original.ai")?;
let tokens = tokenize(&pgf)?;
let document = parse_ai(tokens)?;
let meta = extract_metadata(&document, &pgf);

// Export to SVG, edit in your editor...
let edited = import_svg("edited.svg")?;
let new_pgf = write_pgf(&edited, Some(&meta))?;
build_ai(&new_pgf, "rebuilt.ai", Some("original.ai"), Some(&meta))?;
```

## Why not just use Inkscape / Ghostscript / pdftocairo?

Most tools treat `.ai` as plain PDF and lose the native PGF PostScript layer, CMYK values, spot colors, and round-trip capability.

|                                    | illustrator-rs | Inkscape CLI | Ghostscript / pdftocairo | Adobe Illustrator scripting |
|------------------------------------|:--------------:|:------------:|:------------------------:|:---------------------------:|
| No Illustrator license required    | yes            | yes          | yes                      | no                          |
| Pure Rust, no external binary      | yes            | no           | no                       | no                          |
| Parses native PGF PostScript       | yes            | no (PDF only)| no (PDF only)            | yes                         |
| Preserves CMYK color values        | yes            | no (RGB)     | no (RGB)                 | yes                         |
| Preserves spot colors              | yes            | no           | no                       | yes                         |
| Handles AI24+ Zstandard streams    | yes            | no           | no                       | yes                         |
| Round-trip: SVG → .ai              | yes            | no           | no                       | yes                         |
| Library for programmatic use       | yes            | CLI only     | CLI only                 | proprietary                 |
| License                            | MIT            | GPL          | AGPL / commercial         | proprietary                 |

## Feature flags

| Feature    | Components                                           | Dependencies                   |
|------------|------------------------------------------------------|--------------------------------|
| `model`    | Core data types (colors, geometry, objects, document)| serde                          |
| `parser`   | Container extraction, lexer, PGF → AiDocument        | model, flate2                  |
| `export`   | SVG, JSON, metadata sidecar                          | model, serde_json              |
| `importer` | SVG → AiDocument (path parser + SVG importer)        | model, export, quick-xml       |
| `writer`   | AiDocument → PGF PostScript, PDF container builder   | model, export, parser          |
| `cli`      | clap CLI: extract, inspect, rebuild, check            | parser, export, importer, writer |
| `handler`  | OfficeCli-rust `DocumentHandler` integration          | (git dep)                      |
| `full`     | Everything above                                      | all                            |

## CLI usage

```bash
# Export to SVG and JSON
illustrator-rs extract design.ai --format all --output-dir ./output

# Export each layer separately
illustrator-rs extract design.ai --per-layer

# Inspect file structure
illustrator-rs inspect design.ai

# Rebuild .ai from edited SVG (uses metadata sidecar for color fidelity)
illustrator-rs rebuild edited.svg --original design.ai --output rebuilt.ai

# Verify dependencies
illustrator-rs check
```

## Module structure

```
illustrator-rs/
├── model/        — Colors, geometry, path segments, document types
├── parser/       — Container format detection, PGF lexer, operator registry, parser
├── export/       — JSON serializer, SVG generator, metadata sidecar
├── importer/     — SVG path parser, SVG DOM → document model
├── writer/       — PGF PostScript generator, PDF container builder
├── cli/          — clap CLI (feature-gated)
├── error.rs      — Typed error enum (thiserror)
├── icc.rs        — ICC color utilities
└── lib.rs        — Crate root with feature-gated modules + prelude
```

## License

MIT — see [LICENSE](LICENSE).
