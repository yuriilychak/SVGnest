import { AiFormatPlugin, type AiFormatWasm } from './index.ts';
import init, * as wasm from './generated/ai_format_algo.js';

type WasmModule = AiFormatWasm & {
	default(input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module): Promise<unknown>;
};

let plugin: Promise<AiFormatPlugin> | undefined;

/** Loads the isolated AI WASM adapter once. */
export function loadAiFormatPlugin(): Promise<AiFormatPlugin> {
	plugin ??= init().then(() => new AiFormatPlugin(wasm as WasmModule));
	return plugin;
}
