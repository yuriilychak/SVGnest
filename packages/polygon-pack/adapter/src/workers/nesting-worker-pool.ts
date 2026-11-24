import { NfpWasm } from '../wasm-loader.ts';
import { WorkerMessageType, type WorkerMessage } from './worker-message.ts';

type WorkerRequest = Uint8Array;
type WorkerResult = Uint8Array;

interface Job {
	bins: Uint8Array[];
	resolve: (result: WorkerResult[]) => void;
	reject: (reason: Error) => void;
}

interface PoolWorker {
	worker: Worker;
	job: Job | null;
	ready: { resolve: () => void; reject: (reason: Error) => void } | null;
}

export class NestingWorkerPool {
	#wasm: NfpWasm | null = null;
	#workers: PoolWorker[] = [];
	#queue: Job[] = [];
	#closed = false;
	#initialized = false;
	#initializationError: Error | null = null;
	initialization: Promise<void>;

	constructor(url: string, size = Math.max(1, navigator.hardwareConcurrency || 4)) {
		this.initialization = NfpWasm.create().then((wasm) => {
			this.#wasm = wasm;
			if (this.#closed) return [];
			return Promise.all(Array.from({ length: size }, () => this.#createWorker(url)));
		}).then(() => {
			if (this.#closed) return;
			this.#initialized = true;
			this.#dispatch();
		}).catch((error) => {
			if (this.#closed) return;
			this.#failInitialization(error);
			throw error;
		});
	}

	request(request: WorkerRequest): Promise<WorkerResult> {
		if (this.#closed) return Promise.reject(new Error('Nesting worker pool is closed'));
		if (this.#initializationError) return Promise.reject(this.#initializationError);
		if (!(request instanceof Uint8Array)) return Promise.reject(new TypeError('Nesting worker requests must be Uint8Array frames'));
		const bin = this.#requestBin(request);
		return this.#enqueue([bin]).then(([result]) => result);
	}

	/** Submits a batch while preserving request order in the returned results. */
	requestAll(requests: Uint8Array[], onProgress?: (completed: number, total: number) => void): Promise<Uint8Array[]> {
		if (!Array.isArray(requests)) return Promise.reject(new TypeError('Worker requests must be an array'));
		let bins: Uint8Array[];
		try { bins = requests.map((request) => this.#requestBin(request)); }
		catch (error) { return Promise.reject(error); }
		let completed = 0;
		const chunks = this.#guidedSelfSchedulingChunks(bins);
		return Promise.all(chunks.map((chunk) => this.#enqueue(chunk).then((results) => {
			if (results.length !== chunk.length || results.some((result) => !(result instanceof Uint8Array))) throw new Error('Nesting worker returned an unexpected binary frame');
			completed += results.length;
			onProgress?.(completed, requests.length);
			return results;
		}))).then((results) => results.flat());
	}

	/** Drops queued work while busy workers finish their current WASM call. */
	drain() {
		for (const job of this.#queue.splice(0)) job.reject(new Error('Nesting stopped'));
	}

	terminate() {
		this.#closed = true;
		this.drain();
		for (const worker of this.#workers) {
			worker.worker.terminate();
			if (worker.job) worker.job.reject(new Error('Nesting stopped'));
		}
		this.#workers = [];
	}

	#createWorker(url: string): Promise<void> {
		let ready!: NonNullable<PoolWorker['ready']>;
		const readyPromise = new Promise<void>((resolve, reject) => { ready = { resolve, reject }; });
		const worker: PoolWorker = { worker: new Worker(url, { type: 'module' }), job: null, ready };
		worker.worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => this.#complete(worker, null, data);
		worker.worker.onerror = (event: ErrorEvent) => {
			const error = event.error || new Error(event.message);
			if (worker.ready) {
				worker.ready.reject(error);
				worker.ready = null;
			}
			else this.#complete(worker, error, null);
		};
		this.#workers.push(worker);
		const bin = new Uint8Array(this.#wasm!.binary);
		worker.worker.postMessage({ type: WorkerMessageType.INIT, bin }, [bin.buffer]);
		return readyPromise;
	}

	#complete(worker: PoolWorker, error: Error | null, result: WorkerMessage | null) {
		if (worker.ready && result?.type === WorkerMessageType.READY) {
			worker.ready.resolve();
			worker.ready = null;
			return;
		}
		if (worker.ready && result?.type === WorkerMessageType.INIT_ERROR) {
			worker.ready.reject(new Error(new TextDecoder().decode(result.bin) || 'Nesting WASM initialization failed'));
			worker.ready = null;
			return;
		}
		const job = worker.job;
		worker.job = null;
		if (job) {
			if (error) job.reject(error);
			else if (result?.type === WorkerMessageType.RESULT && result.bin instanceof Uint8Array && job.bins.length === 1) job.resolve([result.bin]);
			else if (result?.type === WorkerMessageType.BATCH_RESULT && Array.isArray(result.bins) && result.bins.every((bin) => bin instanceof Uint8Array) && result.bins.length === job.bins.length) job.resolve(result.bins);
			else job.reject(new Error('Invalid nesting worker response'));
		}
		this.#dispatch();
	}

	#dispatch() {
		if (this.#closed || !this.#initialized) return;
		for (const worker of this.#workers) {
			if (worker.job || this.#queue.length === 0) continue;
			const job = this.#queue.shift();
			if (!job) continue;
			worker.job = job;
			if (job.bins.length === 1) worker.worker.postMessage({ type: WorkerMessageType.WORK, bin: job.bins[0] }, [job.bins[0].buffer]);
			else worker.worker.postMessage({ type: WorkerMessageType.WORK_BATCH, bins: job.bins }, job.bins.map((bin) => bin.buffer));
		}
	}

	#requestBin(request: WorkerRequest): Uint8Array {
		if (!(request instanceof Uint8Array)) throw new TypeError('Nesting worker requests must be Uint8Array frames');
		return new Uint8Array(request.buffer, request.byteOffset, request.byteLength);
	}

	#enqueue(bins: Uint8Array[]): Promise<WorkerResult[]> {
		return new Promise<WorkerResult[]>((resolve, reject: (reason: Error) => void) => {
			this.#queue.push({ bins, resolve, reject });
			this.#dispatch();
		});
	}

	/**
	 * Guided self-scheduling starts with large chunks to minimize coordination,
	 * then shrinks them as work runs out so slow NFP jobs do not strand workers.
	 */
	#guidedSelfSchedulingChunks(bins: Uint8Array[]): Uint8Array[][] {
		const chunks: Uint8Array[][] = [];
		const workerCount = Math.max(1, this.#workers.length);
		let next = 0;
		while (next < bins.length) {
			const chunkSize = Math.ceil((bins.length - next) / workerCount);
			chunks.push(bins.slice(next, next + chunkSize));
			next += chunkSize;
		}
		return chunks;
	}

	#failInitialization(error: unknown) {
		if (this.#initializationError) return;
		this.#initializationError = error instanceof Error ? error : new Error(String(error));
		for (const job of this.#queue.splice(0)) job.reject(this.#initializationError);
		for (const worker of this.#workers) worker.worker.terminate();
		this.#workers = [];
	}
}
