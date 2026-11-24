import { SvgFormatPlugin } from './index.ts';
import type { FormatWasm } from '@svgnest/format-plugin';
import init, * as wasm from './generated/svg_format_core.js';

type WasmModule = FormatWasm & {
	default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
};

let plugin: Promise<SvgFormatPlugin> | undefined;

/** Loads the wasm-bindgen module once and exposes the complete SVG plugin. */
export function loadSvgFormatPlugin(): Promise<SvgFormatPlugin> {
	plugin ??= init().then(() => new SvgFormatPlugin(wasm as WasmModule));
	return plugin;
}
