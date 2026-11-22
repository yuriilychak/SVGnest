const WASM_URL = '/workers/poygon_pack_algo_bg.wasm';

interface WasmExports {
	memory: WebAssembly.Memory;
	__wbindgen_externrefs: WebAssembly.Table;
	__wbindgen_start(): void;
	__wbindgen_malloc(size: number, align: number): number;
	__wbindgen_free(pointer: number, size: number, align: number): void;
	generate(pointer: number, length: number): [number, number];
}

/** Handwritten wasm-bindgen ABI wrapper; workers initialize it from supplied bytes. */
export class NfpWasm {
	#binary: ArrayBuffer;
	#wasm: WasmExports;
	#cachedByteMemory: Uint8Array | null = null;

	constructor(wasm: WasmExports, binary: ArrayBuffer) {
		this.#wasm = wasm;
		this.#binary = binary;
	}

	static async create(binary: ArrayBuffer | Uint8Array = new ArrayBuffer()): Promise<NfpWasm> {
		let wasmBinary: ArrayBuffer | Uint8Array;
		const retainBinary = !binary.byteLength;
		let instanceBinary: ArrayBuffer;
		if (retainBinary) {
			const response = await fetch(WASM_URL);
			if (!response.ok) throw new Error(`Failed to fetch nesting WASM: ${response.status} ${response.statusText}`);
			wasmBinary = await response.arrayBuffer();
			instanceBinary = wasmBinary;
		} else {
			wasmBinary = binary;
			instanceBinary = new ArrayBuffer();
		}

		let wasm: WasmExports;
		const imports = {
			'./poygon_pack_algo_bg.js': {
				__wbindgen_init_externref_table() {
					const table = wasm.__wbindgen_externrefs;
					table.set(0, undefined);
					table.set(1024, undefined);
					table.set(1025, null);
					table.set(1026, true);
					table.set(1027, false);
				}
			}
		};
		const { instance } = await WebAssembly.instantiate(wasmBinary as BufferSource, imports);
		wasm = instance.exports as unknown as WasmExports;
		wasm.__wbindgen_start();
		return new NfpWasm(wasm, instanceBinary);
	}

	/** Returns a transferable copy of the main-thread source bytes. */
	get binary() {
		if (!this.#binary.byteLength) throw new Error('Nesting WASM source bytes are not available in this worker');
		return this.#binary.slice(0);
	}

	#byteMemory() {
		if (!this.#cachedByteMemory || this.#cachedByteMemory.byteLength === 0) {
			this.#cachedByteMemory = new Uint8Array(this.#wasm.memory.buffer);
		}
		return this.#cachedByteMemory;
	}

	generate(request: Uint8Array): Uint8Array {
		if (!this.#wasm) throw new Error('Nesting WASM has not been initialized in this worker');
		if (!(request instanceof Uint8Array)) throw new TypeError('Nesting WASM requests must be Uint8Array buffers');
		const pointer = this.#wasm.__wbindgen_malloc(request.byteLength, 1) >>> 0;
		this.#byteMemory().set(request, pointer);
		const result = this.#wasm.generate(pointer, request.byteLength);
		const values = this.#byteMemory().subarray(result[0], result[0] + result[1]).slice();
		this.#wasm.__wbindgen_free(result[0], result[1], 1);
		return values;
	}
}
