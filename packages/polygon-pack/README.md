# Polygon pack

`polygon-pack` is SVGnest's nesting engine. It is split into two packages so
the geometry implementation remains Rust/WASM while browser coordination stays
small and testable TypeScript.

```text
polygon-pack/
├── core/       # `@svgnest/polygon-pack-core`: Rust/WASM NFP and GA engine
└── adapter/    # `@svgnest/polygon-pack`: TypeScript worker/main-thread bridge
```

## Responsibilities

- `core` calculates no-fit polygons, prepares contours, and advances the
  genetic algorithm. It accepts and returns compact binary payloads.
- `adapter` owns worker lifecycle, progress reporting, cancellation, and the
  public `PolygonPack` API used by the web application.
- The adapter builds the core WASM and copies its browser artifact to
  `apps/web/public/workers/` for the nesting worker.

## Development

Run checks for both layers:

```bash
npm --workspace @svgnest/polygon-pack-core run check
npm --workspace @svgnest/polygon-pack run check
npm --workspace @svgnest/polygon-pack test
```

Build the worker and its WASM dependency:

```bash
npm --workspace @svgnest/polygon-pack run build
```
