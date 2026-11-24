# `@svgnest/polygon-pack`

TypeScript orchestration layer for SVGnest's nesting engine.

`PolygonPack` prepares polygons, runs the Rust/WASM packing algorithm, and reports placement progress and results. By default it uses a pool of browser workers; callers can select the main-thread executor when required.

## Use

```ts
import { PolygonPack } from '@svgnest/polygon-pack';

const packer = new PolygonPack();
```

## Commands

```sh
npm --workspace @svgnest/polygon-pack run build
npm --workspace @svgnest/polygon-pack run test
npm --workspace @svgnest/polygon-pack run check
```

The build emits the worker script and nesting WASM into `apps/web/public/workers` for the web application.
