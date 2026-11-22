# Adobe Illustrator format-plugin plan

## Goal

Add an Adobe Illustrator (`.ai`) input plugin that converts supported artwork into SVGnest polygons and rendered SVG without relying on browser parsing.

## Compatibility scope

1. Detect PDF-compatible Illustrator files (the modern `.ai` family).
2. Detect legacy PostScript/EPS Illustrator files.
3. Reject unknown, encrypted, or unsupported variants with actionable diagnostics.
4. Preserve a common `FormatPlugin` API so the application can select SVG or AI by file extension.

## Implementation phases

1. **Foundation (current):** add the Rust/WASM and TypeScript packages, byte-signature detection, and test fixtures.
2. **PDF-compatible AI (in progress):** `effectcraft-pdf` is integrated for container sniffing and full parse validation in Rust/WASM. Supported vector paths convert to normalized SVG and reuse the SVG Rust core for polygon extraction; paint fidelity remains.
3. **Legacy AI/EPS:** add a PostScript/EPS parser and the same normalized SVG intermediary.
4. **Output:** define whether AI export is supported; initially return SVG documents and diagnose that native AI output is unavailable.
5. **Integration:** register `.ai` file selection in the web app and add corpus-based tests for both families.

## Design constraints

- Parsing and geometry conversion stay in Rust/WASM; TypeScript only adapts serializable results.
- Never silently rasterize content: unsupported effects, images, text, clipping, or encryption must produce diagnostics.
- Do not add a parser dependency until its browser/WASM build and license are verified with representative AI fixtures.

## Validation completed

- `effectcraft-pdf` 0.9.2 is MIT OR Apache-2.0 licensed and parses PDF-compatible AI and EPS inputs from byte buffers.
- `ai-format-algo` builds for `wasm32-unknown-unknown` with Rust 1.95.0.
