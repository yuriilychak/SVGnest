# `@svgnest/format-plugin`

Shared TypeScript contract for SVGnest import and export adapters.

It defines `FormatPlugin`, input polygon data, placements, output documents, and diagnostics. Implementations are DOM-free: they receive serializable data and return serializable results.

## Use

Import the types from `@svgnest/format-plugin` when implementing another file-format adapter. Run `npm --workspace @svgnest/format-plugin run check` to type-check it.
