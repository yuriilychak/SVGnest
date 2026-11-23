import { DxfFormatPlugin, type DxfFormatWasm } from './index.ts';
import init, * as wasm from './generated/dxf_format_algo.js';

type WasmModule = DxfFormatWasm & { default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>; };
let plugin: Promise<DxfFormatPlugin> | undefined;

/** Loads the isolated DXF Rust/WASM adapter once. */
export function loadDxfFormatPlugin(): Promise<DxfFormatPlugin> {
	plugin ??= init().then(() => new DxfFormatPlugin(wasm as WasmModule));
	return plugin;
}
