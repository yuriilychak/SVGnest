# SVGnest Node runtime

The Node app exposes the packing runtime for terminal and service integrations.
It defaults to worker threads; pass `--single-thread` for deterministic,
single-threaded execution.

```bash
npm --workspace @svgnest/node start -- input.svg --bin 0 --out nested.svg --iterations 100
```

The app uses persistent worker threads by default. Pass `--single-thread` to
use the shared single-thread executor instead.

Pass packing settings in a JSON file with `--config settings.json`; individual
flags override it. Supported JSON keys and flags are `curveTolerance`
(`--curve-tolerance`), `spacing` (`--spacing`), `rotations` (`--rotations`),
`populationSize` (`--population-size`), `mutationRate` (`--mutation-rate`),
and `useHoles` (`--use-holes` or `--no-use-holes`).
