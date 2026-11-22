import { loadSvgFormatPlugin } from '@svgnest/svg-format-plugin';
import { AiFormatPlugin, type AiFormatWasm } from './index.ts';
import init, * as wasm from './generated/ai_format_algo.js';

type WasmModule = AiFormatWasm & {
	default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
};

let plugin: Promise<AiFormatPlugin> | undefined;

/** Loads the AI and SVG WASM adapters once. */
export function loadAiFormatPlugin(): Promise<AiFormatPlugin> {
	plugin ??= Promise.all([init(), loadSvgFormatPlugin()]).then(([, svg]) => new AiFormatPlugin(wasm as WasmModule, svg));
	return plugin;
}
