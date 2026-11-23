# DXF format-plugin roadmap

The DXF adapter keeps parsing, geometry conversion, and native export in Rust/WASM. SVG remains the preview surface; native DXF is the download surface.

## 1. Entity coverage and drawing structure

1. **SPLINE** — flatten planar B-splines and rational B-splines into deterministic contours for nesting; export placed splines as `LWPOLYLINE` geometry. **In progress.**
2. **BLOCKS / INSERT** — parse the `BLOCKS` section and expand inserts with translation, scale, and rotation before nesting.
3. **HATCH boundaries** — read closed polyline and line/arc/ellipse/spline boundary paths as outer contours and holes; ignore visual hatch patterns.
4. Preserve source layer names and write nested output entities onto their original layers.

## 2. Container compatibility

1. Support binary DXF input after ASCII coverage is validated. ASCII DXF remains the editable/exported format.
2. Reject unsupported 3D/non-planar entities with diagnostics instead of silently dropping them.

## Acceptance criteria

- Every added entity has Rust fixtures covering parsing, polygon creation, and native DXF output.
- Flattening is deterministic and produces finite 2D contours.
- A DXF round trip yields a valid ASCII DXF accepted by common CAD viewers.
