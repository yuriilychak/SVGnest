# `@svgnest/svg-format-plugin`

Browser-facing adapter that implements the shared format-plugin contract for SVG files.

It loads the `svg-format-algo` WASM module and exposes `loadSvgFormatPlugin`, `SvgFormatPlugin`, and `SvgInputAdapter`. The adapter converts SVG source to polygons and renders placement results back to SVG without browser DOM parsing.

## Use

```ts
import { loadSvgFormatPlugin } from '@svgnest/svg-format-plugin';

const svg = await loadSvgFormatPlugin();
const polygons = await svg.inputToPolygons(source, { curveTolerance: 0.3 });
```
