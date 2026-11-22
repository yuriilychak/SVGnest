// src/wasm-loader.ts
var WASM_URL = "/workers/poygon_pack_algo_bg.wasm";
var NfpWasm = class _NfpWasm {
  #binary;
  #wasm;
  #cachedByteMemory = null;
  constructor(wasm, binary) {
    this.#wasm = wasm;
    this.#binary = binary;
  }
  static async create(binary = new ArrayBuffer()) {
    let wasmBinary;
    const retainBinary = !binary.byteLength;
    let instanceBinary;
    if (retainBinary) {
      const response = await fetch(WASM_URL);
      if (!response.ok) throw new Error(`Failed to fetch nesting WASM: ${response.status} ${response.statusText}`);
      wasmBinary = await response.arrayBuffer();
      instanceBinary = wasmBinary;
    } else {
      wasmBinary = binary;
      instanceBinary = new ArrayBuffer();
    }
    let wasm;
    const imports = {
      "./poygon_pack_algo_bg.js": {
        __wbindgen_init_externref_table() {
          const table = wasm.__wbindgen_externrefs;
          table.set(0, void 0);
          table.set(1024, void 0);
          table.set(1025, null);
          table.set(1026, true);
          table.set(1027, false);
        }
      }
    };
    const { instance } = await WebAssembly.instantiate(wasmBinary, imports);
    wasm = instance.exports;
    wasm.__wbindgen_start();
    return new _NfpWasm(wasm, instanceBinary);
  }
  /** Returns a transferable copy of the main-thread source bytes. */
  get binary() {
    if (!this.#binary.byteLength) throw new Error("Nesting WASM source bytes are not available in this worker");
    return this.#binary.slice(0);
  }
  #byteMemory() {
    if (!this.#cachedByteMemory || this.#cachedByteMemory.byteLength === 0) {
      this.#cachedByteMemory = new Uint8Array(this.#wasm.memory.buffer);
    }
    return this.#cachedByteMemory;
  }
  generate(request) {
    if (!this.#wasm) throw new Error("Nesting WASM has not been initialized in this worker");
    if (!(request instanceof Uint8Array)) throw new TypeError("Nesting WASM requests must be Uint8Array buffers");
    const pointer = this.#wasm.__wbindgen_malloc(request.byteLength, 1) >>> 0;
    this.#byteMemory().set(request, pointer);
    const result = this.#wasm.generate(pointer, request.byteLength);
    const values = this.#byteMemory().subarray(result[0], result[0] + result[1]).slice();
    this.#wasm.__wbindgen_free(result[0], result[1], 1);
    return values;
  }
};

// src/workers/nesting.worker.ts
var nfpWasm;
self.onmessage = async ({ data }) => {
  if (!data?.type) {
    throw new Error("Nesting worker message type is required");
  }
  if (!nfpWasm) {
    if (data?.type !== 1 /* INIT */ || !(data.bin instanceof Uint8Array)) {
      throw new Error("Nesting worker must be initialized before it receives work");
    }
    let type;
    let bin;
    try {
      nfpWasm = await NfpWasm.create(data.bin);
      type = 3 /* READY */;
      bin = new Uint8Array();
    } catch (error) {
      type = 4 /* INIT_ERROR */;
      bin = new TextEncoder().encode(error instanceof Error ? error.message : String(error));
    }
    self.postMessage({ type, bin }, [bin.buffer]);
    return;
  }
  if (data?.type === 2 /* WORK */ && data.bin instanceof Uint8Array) {
    const bin = nfpWasm.generate(data.bin);
    self.postMessage({ type: 5 /* RESULT */, bin }, [bin.buffer]);
    return;
  }
  if (data?.type === 6 /* WORK_BATCH */ && Array.isArray(data.bins) && data.bins.every((bin) => bin instanceof Uint8Array)) {
    const bins = data.bins.map((bin) => nfpWasm.generate(bin));
    self.postMessage({ type: 7 /* BATCH_RESULT */, bins }, bins.map((bin) => bin.buffer));
    return;
  }
  throw new Error(`Unsupported nesting worker request: ${data?.type}`);
};
