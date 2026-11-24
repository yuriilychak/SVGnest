import { DxfFormatPlugin } from './index.ts';
import type { FormatWasm } from '@svgnest/format-plugin';
import init, * as wasm from './generated/dxf_format_core.js';

type WasmModule = FormatWasm & { default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>; };
let plugin: Promise<DxfFormatPlugin> | undefined;

/** Loads the isolated DXF Rust/WASM adapter once. */
export function loadDxfFormatPlugin(): Promise<DxfFormatPlugin> {
	plugin ??= init().then(() => new DxfFormatPlugin(wasm as WasmModule));
	return plugin;
}
