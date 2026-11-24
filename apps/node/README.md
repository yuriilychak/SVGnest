# SVGnest Node runtime

The Node app exposes the packing runtime for terminal and service integrations.
It defaults to worker threads; pass `--single-thread` for deterministic,
single-threaded execution.

```bash
npm --workspace @svgnest/node start -- input.svg --bin 0 --out nested.svg --iterations 100
```

The app uses persistent worker threads by default. Pass `--single-thread` to
use the shared single-thread executor instead.
