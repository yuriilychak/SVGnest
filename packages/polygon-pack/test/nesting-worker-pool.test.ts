import assert from 'node:assert/strict';
import test from 'node:test';

let fetchCount = 0;
let workerCount = 0;
const transferredWasm = [];
const transferredWork = [];
const transferredBatches = [];

class MockWorker {
	constructor() {
		workerCount += 1;
		this.terminated = false;
	}

	postMessage(message, transfer) {
		if (message.type === WorkerMessageType.INIT && message.bin instanceof Uint8Array) {
			transferredWasm.push({ wasm: message.bin, transfer: transfer[0] });
			queueMicrotask(() => this.onmessage({ data: { type: WorkerMessageType.READY, bin: new Uint8Array() } }));
		} else if (message.type === WorkerMessageType.WORK && message.bin instanceof Uint8Array) {
			transferredWork.push({ bin: message.bin, transfer: transfer[0] });
			queueMicrotask(() => this.onmessage({ data: { type: WorkerMessageType.RESULT, bin: message.bin.slice() } }));
		} else if (message.type === WorkerMessageType.WORK_BATCH && Array.isArray(message.bins)) {
			transferredBatches.push({ bins: message.bins, transfer });
			queueMicrotask(() => this.onmessage({ data: { type: WorkerMessageType.BATCH_RESULT, bins: message.bins.map(bin => bin.slice()) } }));
		}
	}

	terminate() {
		this.terminated = true;
	}
}

globalThis.navigator = { hardwareConcurrency: 2 };
globalThis.Worker = MockWorker;
globalThis.fetch = async () => {
	fetchCount += 1;
	return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};
globalThis.WebAssembly.instantiate = async () => ({
	instance: { exports: { __wbindgen_start() {} } }
});

const { WorkerMessageType } = await import('../src/workers/worker-message.ts');
const { NestingWorkerPool } = await import('../src/workers/nesting-worker-pool.ts');
const { MainThreadNestingExecutor } = await import('../src/executors/main-thread-executor.ts');
const { PolygonPack } = await import('../src/polygon-pack.ts');

test('fetches WASM once and copies its buffer for each worker initialization', async () => {
	const pool = new NestingWorkerPool('/workers/nesting.worker.ts', 2);
	await pool.initialization;

	assert.equal(fetchCount, 1);
	assert.equal(transferredWasm.length, 2);
	assert.notStrictEqual(transferredWasm[0].wasm, transferredWasm[1].wasm);
	assert.strictEqual(transferredWasm[0].wasm.buffer, transferredWasm[0].transfer);
	assert.strictEqual(transferredWasm[1].wasm.buffer, transferredWasm[1].transfer);
	pool.terminate();
});

test('transfers nesting requests and results as Uint8Array frames', async () => {
	const pool = new NestingWorkerPool('/workers/nesting.worker.ts', 1);
	await pool.initialization;
	const request = new Uint8Array([2, 0x80, 0, 0, 0, 0, 0, 0]);
	const result = await pool.request(request);

	assert.ok(transferredWork.at(-1).bin instanceof Uint8Array);
	assert.strictEqual(transferredWork.at(-1).bin.buffer, transferredWork.at(-1).transfer);
	assert.deepEqual([...result], [...request]);
	pool.terminate();
});

test('uses guided self-scheduling for NFP chunks', async () => {
	const batchesBefore = transferredBatches.length;
	const workBefore = transferredWork.length;
	const pool = new NestingWorkerPool('/workers/nesting.worker.ts', 2);
	await pool.initialization;
	const requests = Array.from({ length: 13 }, (_, index) => new Uint8Array([index]));
	const progress = [];
	const results = await pool.requestAll(requests, (completed) => progress.push(completed));

	assert.equal(transferredBatches.length - batchesBefore, 3);
	assert.deepEqual(transferredBatches.slice(batchesBefore).map(({ bins }) => bins.length), [7, 3, 2]);
	assert.equal(transferredWork.length - workBefore, 1);
	assert.deepEqual(results.map(([value]) => value), requests.map(([value]) => value));
	assert.equal(progress.at(-1), requests.length);
	pool.terminate();
});

test('does not spawn a worker pool until nesting actually starts', () => {
	const workersBefore = workerCount;
	const pack = new PolygonPack();

	assert.equal(workerCount, workersBefore);
	pack.terminate();
});

test('runs the same framed requests without Worker instances in main-thread mode', async () => {
	const generated = [];
	const executor = new MainThreadNestingExecutor(async () => ({
		generate(request) {
			generated.push(request);
			return request.slice();
		}
	}));
	const progress = [];
	const requests = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
	const results = await executor.requestAll(requests, (completed, total) => progress.push([completed, total]));

	assert.deepEqual(results.map(([value]) => value), [1, 2, 3]);
	assert.equal(generated.length, 3);
	assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
	executor.terminate();
});
