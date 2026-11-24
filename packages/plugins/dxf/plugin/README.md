# `@svgnest/dxf-format-plugin`

Browser-facing ASCII DXF adapter for SVGnest. It is a thin TypeScript contract adapter around the Rust/WASM DXF core. DXF input is converted to SVG for preview and selection, while `outputToData` writes the nested result as native ASCII DXF.

Supported entities: `LINE`, `LWPOLYLINE`, `POLYLINE`, `CIRCLE`, `ARC`, `ELLIPSE`, and planar `SPLINE`. Binary DXF is rejected with an actionable error. See the [DXF roadmap](../../../../docs/dxf-format-plugin-plan.md) for planned block, hatch, layer, and binary-DXF support.
