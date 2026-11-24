import { readFile } from 'node:fs/promises';
import { AiFormatPlugin } from './index.ts';
import type { FormatWasm } from '@svgnest/format-plugin';
import init, * as wasm from './generated/ai_format_core.js';

export async function loadAiFormatPlugin(): Promise<AiFormatPlugin> {
	await init(await readFile(new URL('./generated/ai_format_core_bg.wasm', import.meta.url)));
	return new AiFormatPlugin(wasm as FormatWasm);
}
