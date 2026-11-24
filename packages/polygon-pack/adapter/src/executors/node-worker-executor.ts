import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import type { NestingExecutor } from './types.ts';
type Job = { request: Uint8Array; resolve: (result: Uint8Array) => void; reject: (error: Error) => void };
type PoolWorker = { worker: Worker; job: Job | null; ready: boolean };

/** Persistent Node worker pool: each worker creates its WASM instance once. */
export class NodeWorkerNestingExecutor implements NestingExecutor {
	#workers: PoolWorker[] = []; #queue: Job[] = []; #closed = false; #ready: Promise<void>;
	constructor(wasmPath = new URL('../../../core/pkg/polygon_pack_core_bg.wasm', import.meta.url), size = availableParallelism()) {
		this.#ready = readFile(wasmPath)
			.then((bytes) => Promise.all(Array.from({ length: Math.max(1, size) }, () => this.#createWorker(bytes))))
			.then(() => undefined);
	}
	async request(request: Uint8Array): Promise<Uint8Array> {
		if (!(request instanceof Uint8Array)) throw new TypeError('Nesting requests must be Uint8Array frames');
		if (this.#closed) throw new Error('Node worker nesting executor is closed');
		await this.#ready;
		return new Promise((resolve, reject) => { this.#queue.push({ request: request.slice(), resolve, reject }); this.#dispatch(); });
	}
	async requestAll(requests: Uint8Array[], onProgress?: (completed: number, total: number) => void): Promise<Uint8Array[]> {
		let completed = 0; return Promise.all(requests.map(async request => { const result = await this.request(request); onProgress?.(++completed, requests.length); return result; }));
	}
	drain() { for (const job of this.#queue.splice(0)) job.reject(new Error('Nesting stopped')); }
	terminate() { this.#closed = true; this.drain(); for (const entry of this.#workers) void entry.worker.terminate(); this.#workers = []; }
	#createWorker(bytes: Uint8Array): Promise<void> { return new Promise((resolve, reject) => {
		const entry: PoolWorker = { worker: new Worker(new URL('../workers/node-nesting.worker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] }), job: null, ready: false };
		entry.worker.on('message', (message: { type: 'ready' } | { type: 'result'; result: Uint8Array }) => {
			if (message.type === 'ready') { entry.ready = true; resolve(); this.#dispatch(); return; }
			const job = entry.job; entry.job = null; if (job) job.resolve(new Uint8Array(message.result)); this.#dispatch();
		});
		entry.worker.once('error', (error: Error) => { if (!entry.ready) reject(error); entry.job?.reject(error); }); this.#workers.push(entry);
		const wasm = bytes.slice(); entry.worker.postMessage({ type: 'init', wasm }, [wasm.buffer as ArrayBuffer]);
	}); }
	#dispatch() { if (this.#closed) return; for (const entry of this.#workers) { if (!entry.ready || entry.job || !this.#queue.length) continue; const job = this.#queue.shift()!; entry.job = job; entry.worker.postMessage({ type: 'work', request: job.request }, [job.request.buffer as ArrayBuffer]); } }
}
