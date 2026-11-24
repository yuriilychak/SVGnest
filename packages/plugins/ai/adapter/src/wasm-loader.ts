import { AiFormatPlugin } from './index.ts';
import type { FormatWasm } from '@svgnest/format-plugin';
import init, * as wasm from './generated/ai_format_core.js';

type WasmModule = FormatWasm & {
	default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
};

let plugin: Promise<AiFormatPlugin> | undefined;

/** Loads the isolated AI WASM adapter once. */
export function loadAiFormatPlugin(): Promise<AiFormatPlugin> {
	plugin ??= init().then(() => new AiFormatPlugin(wasm as WasmModule));
	return plugin;
}
