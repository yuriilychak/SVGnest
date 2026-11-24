# Example format plugin template

Copy this directory to `packages/plugins/<format>/`, remove the `.example`
suffixes, and replace `example` in package names, Rust crate names, WASM
output names, and loader symbols.

The template delegates SVG normalization and binary payload encoding to
`svg-format-algo`. A real importer replaces `parse_to_svg` with a native
format parser, then implements native serialization in `output_to_data`.

See [`../README.md`](../README.md) for integration steps.
