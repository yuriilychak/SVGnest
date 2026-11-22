import { NestingWorkerPool } from '../workers/nesting-worker-pool.ts';
import type { NestingExecutor } from './types.ts';

/** Owns the multithreaded worker-pool implementation behind the shared executor API. */
export class WorkerNestingExecutor implements NestingExecutor {
	#pool: NestingWorkerPool;

	constructor(url = new URL('workers/nesting.worker.js', document.baseURI).href) {
		this.#pool = new NestingWorkerPool(url);
	}

	request(request: Uint8Array) {
		return this.#pool.request(request);
	}

	requestAll(requests: Uint8Array[], onProgress?: (completed: number, total: number) => void) {
		return this.#pool.requestAll(requests, onProgress);
	}

	drain() {
		this.#pool.drain();
	}

	terminate() {
		this.#pool.terminate();
	}
}
