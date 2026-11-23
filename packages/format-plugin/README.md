# `@svgnest/format-plugin`

Shared TypeScript contract for SVGnest import and export adapters.

It defines `FormatPlugin`, the uniform `FormatWasm` Rust/WASM surface, input polygon data, placements, output documents, and diagnostics. Implementations are DOM-free: they receive serializable data and return serializable results.

Every format core implements the same four WASM methods: `input_to_svg`, `input_to_polygons`, `output_to_svg`, and `output_to_data`. Polygon and SVG-document payloads use shared versioned binary codecs; `output_to_data` contains the format's native file bytes.

## Use

Import the types from `@svgnest/format-plugin` when implementing another file-format adapter. Run `npm --workspace @svgnest/format-plugin run check` to type-check it.
