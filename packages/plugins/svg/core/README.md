# `@svgnest/svg-format-core`

Rust/WebAssembly core for SVG parsing, normalization, polygonization, and placement output.

The crate uses `usvg` to convert source SVG into the data consumed by the nesting engine. It is built for the browser by `wasm-pack`; the generated module is written to `../adapter/src/generated`.

## Commands

```sh
npm --workspace @svgnest/svg-format-core run build
npm --workspace @svgnest/svg-format-core run check
```
