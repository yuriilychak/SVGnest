import { MainThreadNestingExecutor } from './main-thread-executor.ts';
import { NfpWasm } from '../wasm-loader.ts';

/**
 * Node variant of the shared single-thread executor. Its scheduling and
 * cancellation behavior are identical to the web main-thread executor; only
 * WASM loading differs because Node reads a local file instead of fetch().
 */
export class NodeSingleThreadNestingExecutor extends MainThreadNestingExecutor {
	constructor(wasmPath = new URL('../../../core/pkg/polygon_pack_core_bg.wasm', import.meta.url)) {
		super(async () => {
			const { readFile } = await import('node:fs/promises');
			return NfpWasm.create(await readFile(wasmPath));
		});
	}
}
