# `@svgnest/dxf-format-plugin`

Browser-facing ASCII DXF adapter for SVGnest. It is a thin TypeScript contract adapter around the Rust/WASM DXF core, which converts DXF entities into SVG and delegates polygon extraction and nesting output to the shared Rust SVG core.

Supported entities: `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE`, `ARC`, and `ELLIPSE`. Binary DXF is rejected with an actionable error.
