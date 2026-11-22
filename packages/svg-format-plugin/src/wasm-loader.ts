import { SvgFormatPlugin, type SvgOutputWasm } from './index.ts';
import init, * as wasm from './generated/svg_format_algo.js';

type WasmModule = SvgOutputWasm & {
	default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
};

let plugin: Promise<SvgFormatPlugin> | undefined;

/** Loads the wasm-bindgen module once and exposes the complete SVG plugin. */
export function loadSvgFormatPlugin(): Promise<SvgFormatPlugin> {
	plugin ??= init().then(() => new SvgFormatPlugin(wasm as WasmModule));
	return plugin;
}
