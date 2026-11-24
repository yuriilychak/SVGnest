import { parentPort } from 'node:worker_threads';
import { NfpWasm } from '../wasm-loader.ts';
let wasm: NfpWasm | null = null;
parentPort?.on('message', async (message: { type: 'init'; wasm: Uint8Array } | { type: 'work'; request: Uint8Array }) => {
	if (message.type === 'init') { wasm = await NfpWasm.create(message.wasm); parentPort?.postMessage({ type: 'ready' }); return; }
	if (!wasm) throw new Error('Node nesting worker has not been initialized');
	const result = wasm.generate(new Uint8Array(message.request)); parentPort?.postMessage({ type: 'result', result }, [result.buffer as ArrayBuffer]);
});
