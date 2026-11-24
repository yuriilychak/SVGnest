# `@svgnest/svg-format-algo`

Rust/WebAssembly core for SVG parsing, normalization, polygonization, and placement output.

The crate uses `usvg` to convert source SVG into the data consumed by the nesting engine. It is built for the browser by `wasm-pack`; the generated module is written to `../plugin/src/generated`.

## Commands

```sh
npm --workspace @svgnest/svg-format-algo run build
npm --workspace @svgnest/svg-format-algo run check
```
