import { NfpWasm } from '../wasm-loader.ts';
import { WorkerMessageType, type WorkerMessage } from './worker-message.ts';

let nfpWasm: NfpWasm | undefined;

self.onmessage = async ({ data }: MessageEvent<WorkerMessage>) => {
	if (!data?.type) {
		throw new Error('Nesting worker message type is required');
	}

	if (!nfpWasm) {
		if (data?.type !== WorkerMessageType.INIT || !(data.bin instanceof Uint8Array)) {
			throw new Error('Nesting worker must be initialized before it receives work');
		}
		let type: WorkerMessageType;
		let bin: Uint8Array;
		try {
			nfpWasm = await NfpWasm.create(data.bin);
			type = WorkerMessageType.READY;
			bin = new Uint8Array();
		} catch (error) {
			type = WorkerMessageType.INIT_ERROR;
			bin = new TextEncoder().encode(error instanceof Error ? error.message : String(error));
		}
		self.postMessage({ type, bin }, [bin.buffer]);
		return;
	}

	if (data?.type === WorkerMessageType.WORK && data.bin instanceof Uint8Array) {
		const bin = nfpWasm.generate(data.bin);
		self.postMessage({ type: WorkerMessageType.RESULT, bin }, [bin.buffer]);
		return;
	}
	if (data?.type === WorkerMessageType.WORK_BATCH && Array.isArray(data.bins) && data.bins.every((bin) => bin instanceof Uint8Array)) {
		const bins = data.bins.map((bin) => nfpWasm!.generate(bin));
		self.postMessage({ type: WorkerMessageType.BATCH_RESULT, bins }, bins.map((bin) => bin.buffer));
		return;
	}
	throw new Error(`Unsupported nesting worker request: ${data?.type}`);
};
