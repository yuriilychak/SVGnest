import init, * as wasm from '../pkg/wasm-nesting.js';

// Automatically initialize the WebAssembly module on load
const wasmInitPromise = init().then(() => {
  console.log('WASM module initialized');
  // Dispatch a CustomEvent to signal that the WASM module is ready
  const event = new CustomEvent('wasmReady');
  self.dispatchEvent(event); // Use `self` for compatibility with Web Workers
});

// Export everything from the WASM module, ensuring initialization is awaited
export const ready = wasmInitPromise;
export * from '../pkg/wasm-nesting.js';