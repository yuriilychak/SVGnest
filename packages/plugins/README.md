# Format plugins

Each file format is self-contained under `packages/plugins/<format>/`:

```text
packages/plugins/<format>/
├── algo/                 # Rust parser/serializer compiled to WASM
├── plugin/               # Browser-facing TypeScript adapter
└── <format>-specific/    # Optional Rust libraries, such as illustrator-rs
```

The shared TypeScript contract is `@svgnest/format-plugin` in `format/`.
All parsing, polygon conversion, placement rendering, and native-file output
belong in Rust. The TypeScript adapter only converts inputs to bytes, decodes
the shared binary payloads, loads WASM, and reports format diagnostics.

## Create a format

1. Copy `example/` to `packages/plugins/<format>/` and replace every
   `example` placeholder with the format name.
2. Give the two npm packages stable names, such as
   `@svgnest/<format>-format-algo` and `@svgnest/<format>-format-plugin`.
3. Implement all four WASM exports in `algo/src/lib.rs`:
   `input_to_svg`, `input_to_polygons`, `output_to_svg`, and `output_to_data`.
   Their signatures must match `FormatWasm` in `format/src/index.ts`.
4. Use the shared binary codecs: return `SNP2` polygon data from
   `input_to_polygons` and `SNP3` SVG-document data from `output_to_svg`.
   `output_to_data` returns the native bytes of the original format.
5. Point the algo build script at `../plugin/src/generated` and add the new
   plugin package to `apps/web/package.json`, `apps/web/vite.config.mjs`, and
   the format choice in `apps/web/src/app-flow/hooks.ts`.
6. Run `npm run check` from the repository root. Run
   `npm --workspace @svgnest/<format>-format-algo run build` when validating
   the generated WASM boundary directly.

## Integration rules

- Keep `inputToSvg` display-only: it must return normalized SVG with stable
  `data-svgnest-source` attributes so the UI can select a bin.
- Use `encodePlacementOutput` before calling output WASM methods and decode
  `SNP2`/`SNP3` payloads with the helpers from `@svgnest/format-plugin`.
- Parse untrusted format input in Rust; do not add browser DOM parsing or
  format-specific geometry code to the app.
- Return warnings for safely ignored features. Reject geometry that cannot be
  nested without guessing, such as ambiguous open contours.
- Preserve the input format on download: `outputToData` should emit native
  bytes, while `outputToSvg` exists for preview rendering.

`example/` is intentionally not an npm workspace. It is a copyable template,
so it never adds a mock file type to the production UI or build graph.
