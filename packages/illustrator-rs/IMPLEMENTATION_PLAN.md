# illustrator-rs Implementation Plan

## Overview

Port [`illustrator-exporter`](https://github.com/Calvin-LLC/illustrator-exporter) (Python, MIT) to Rust as a standalone, publishable crate `illustrator-rs`.

**Source:** `../illustrator-exporter/` (25 files, ~5,662 lines Python)

## Crate Structure

```
illustrator-rs/src/
├── lib.rs              # Crate root — re-exports, prelude
├── error.rs            # Error enum (thiserror)
├── model/
│   ├── mod.rs
│   ├── colors.rs       # Color types + serde
│   ├── geometry.rs     # Point, Matrix, BoundingBox, PathSegment
│   ├── objects.rs      # AiPath, AiGroup, AiCompoundPath, AiText, AiImage
│   └── document.rs     # AiLayer, AiDocument
├── parser/
│   ├── mod.rs
│   ├── container.rs    # Detect AI type, extract PGF from PDF/EPS/PS
│   ├── lexer.rs        # PGF PostScript tokenizer → Token stream
│   ├── operators.rs    # 130+ PGF operator definitions
│   └── parser.rs       # Token stream → AiDocument
├── export/
│   ├── mod.rs
│   ├── json.rs         # AiDocument → serde_json
│   ├── metadata.rs     # .ai-meta.json sidecar R/W
│   └── svg.rs          # AiDocument → SVG string
├── importer/
│   ├── mod.rs
│   ├── path.rs         # SVG path d="" → PathSegments
│   └── svg.rs          # SVG DOM → AiDocument
├── writer/
│   ├── mod.rs
│   ├── pgf.rs          # AiDocument → PGF PostScript bytes
│   └── container.rs    # PGF → PDF-wrapped .ai file
├── icc.rs              # ICC color profile parsing
├── cli.rs              # clap CLI (feature-gated)
└── handler.rs          # OfficeCli DocumentHandler (feature-gated)
```

## Implementation Phases (Parallelizable)

### Phase 1: Core Data Model (no external deps beyond serde)
**Files:** `error.rs`, `model/colors.rs`, `model/geometry.rs`, `model/objects.rs`, `model/document.rs`, `model/mod.rs`

**Depends on:** Nothing
**Testable:** Immediately — `#[test]` round-trip JSON serialization

### Phase 2: Foundation (depends on Phase 1)
- **2a:** `parser/lexer.rs` — depends on `model/geometry.rs`
- **2b:** `parser/operators.rs` — standalone operator registry
- **2c:** `icc.rs` — standalone ICC utilities

### Phase 3: Pipeline (depends on Phases 1-2)
- **3a:** `parser/container.rs` — depends on nothing in model (just bytes → PGF string)
- **3b:** `parser/parser.rs` — depends on model, lexer, operators

### Phase 4: Output (depends on Phase 1, 3)
- **4a:** `export/json.rs`
- **4b:** `export/svg.rs`
- **4c:** `export/metadata.rs`

### Phase 5: Input (depends on Phase 1, 4)
- **5a:** `importer/path.rs`
- **5b:** `importer/svg.rs`

### Phase 6: Write (depends on Phase 1, 4)
- **6a:** `writer/pgf.rs`
- **6b:** `writer/container.rs`

### Phase 7: Integration (depends on all above)
- **7a:** `cli.rs` (feature-gated)
- **7b:** `handler.rs` (feature-gated)
- **7c:** `lib.rs` final re-exports + prelude

## Feature Flags

```toml
[features]
default = ["model", "parser", "export", "importer", "writer", "cli"]
model = []
parser = ["model"]
export = ["model"]
importer = ["model", "export"]
writer = ["model", "export"]
cli = ["dep:clap"]
handler = ["dep:handler-common"]
pdf = ["dep:lopdf"]
zstd = ["dep:zstd"]
```

## Cargo.toml Dependencies

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
quick-xml = "0.36"
flate2 = "1.0"
base64 = "0.22"
log = "0.4"
thiserror = "2"

# Optional
clap = { version = "4", features = ["derive"], optional = true }
lopdf = { version = "0.34", optional = true }
zstd = { version = "0.13", optional = true }
env_logger = { version = "0.11", optional = true }
handler-common = { git = "https://github.com/Pilser/OfficeCli-rust", optional = true }

[dev-dependencies]
env_logger = "0.11"
```

## Sub-Agent Task Assignments

### Agent A: Model + Error
Build `error.rs`, `model/colors.rs`, `model/geometry.rs`, `model/objects.rs`, `model/document.rs`, `model/mod.rs`
- Output: Complete files with all types, serde derives, helper methods
- Verify: `cargo test` passes for model module

### Agent B: Lexer + Operators + ICC
Build `parser/lexer.rs`, `parser/operators.rs`, `icc.rs`
- Output: Complete tokenizer, operator registry, ICC utilities
- Verify: Tokenizer tests pass

### Agent C: Container + Parser
Build `parser/container.rs`, `parser/parser.rs`, `parser/mod.rs`
- Requires: Model + Lexer + Operators complete
- Output: Complete parsing pipeline bytes → AiDocument
- Verify: Parse a test .ai file

### Agent D: Exports (JSON + SVG + Metadata)
Build `export/json.rs`, `export/svg.rs`, `export/metadata.rs`, `export/mod.rs`
- Requires: Model complete
- Output: AiDocument → JSON string, SVG string, metadata sidecar
- Verify: Export a small document and check output

### Agent E: Imports (Path + SVG)
Build `importer/path.rs`, `importer/svg.rs`, `importer/mod.rs`
- Requires: Model + Metadata complete
- Output: SVG → AiDocument parser
- Verify: Import a simple SVG and re-export to JSON

### Agent F: Writer (PGF + Container)
Build `writer/pgf.rs`, `writer/container.rs`, `writer/mod.rs`
- Requires: Model + Metadata complete
- Output: AiDocument → PGF PostScript → .ai file bytes
- Verify: Round-trip document → PGF → parse back

### Agent G: CLI + Handler + Lib
Build `cli.rs`, `handler.rs`, `lib.rs`
- Requires: All modules complete
- Output: Final lib.rs with re-exports, CLI commands, handler impl
- Verify: `cargo build --all-features`

## Verification Strategy

```bash
# After each phase
cargo test

# Model round-trip
cargo test -p illustrator-rs model

# Full pipeline
cargo test --all-features
```

## Parallel Execution Order

```
Phase 1 ─────────────────┐
                          ├── Agent A ──────────────┐
Phase 2a ── Agent B ─────┤                          │
Phase 2b ── Agent B ─────┤                          │
Phase 2c ── Agent B ─────┤                          │
                          │                          ├── Agent D ──┐
Phase 3a ── Agent C ─────┤                          │              │
Phase 3b ── Agent C ─────┘                          │              │
                          Agent D (pending A) ◄─────┘              │
                          Agent E (pending A, D) ◄─────────────────┤
                          Agent F (pending A, D) ◄─────────────────┤
                                                                    │
                          Agent G (pending A-F) ◄───────────────────┘
```

## Execution

1. Agent A (Model) → seeds Agents D, E, F, G
2. Agent B (Lexer) → seeds Agent C
3. Agent C (Parser) → seeds Agents D, E, F, G
4. Agents D, E, F run in parallel after A + C
5. Agent G runs last after everything else

We launch Agents A and B in parallel first, then spawn C when B finishes, then D/E/F when A+C finish, then G last.
