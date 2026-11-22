import { NfpWasm } from '../wasm-loader.ts';
import type { NestingExecutor } from './types.ts';

type WasmGenerator = Pick<NfpWasm, 'generate'>;
type WasmFactory = () => Promise<WasmGenerator>;

/**
 * Runs the identical Rust/WASM protocol on the browser main thread. It is
 * intended for debugging, environments without Worker support, and parity
 * checks; large nesting jobs can block rendering.
 */
export class MainThreadNestingExecutor implements NestingExecutor {
	#wasm: Promise<WasmGenerator>;
	#runId = 0;
	#closed = false;

	constructor(createWasm: WasmFactory = () => NfpWasm.create()) {
		this.#wasm = createWasm();
	}

	async request(request: Uint8Array): Promise<Uint8Array> {
		this.#validate(request);
		const runId = this.#runId;
		const wasm = await this.#wasm;
		this.#ensureActive(runId);
		return wasm.generate(request);
	}

	async requestAll(requests: Uint8Array[], onProgress?: (completed: number, total: number) => void): Promise<Uint8Array[]> {
		if (!Array.isArray(requests)) throw new TypeError('Nesting requests must be an array');
		requests.forEach((request) => this.#validate(request));
		const runId = this.#runId;
		const wasm = await this.#wasm;
		const results: Uint8Array[] = [];
		for (const request of requests) {
			this.#ensureActive(runId);
			results.push(wasm.generate(request));
			onProgress?.(results.length, requests.length);
			// Yield between jobs so progress and stop events can be observed.
			if (results.length < requests.length) await new Promise<void>((resolve) => setTimeout(resolve, 0));
		}
		return results;
	}

	drain() {
		this.#runId += 1;
	}

	terminate() {
		this.#closed = true;
		this.drain();
	}

	#validate(request: Uint8Array) {
		if (this.#closed) throw new Error('Main-thread nesting executor is closed');
		if (!(request instanceof Uint8Array)) throw new TypeError('Nesting requests must be Uint8Array frames');
	}

	#ensureActive(runId: number) {
		if (this.#closed || runId !== this.#runId) throw new Error('Nesting stopped');
	}
}
