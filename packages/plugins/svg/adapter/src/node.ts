import { readFile } from 'node:fs/promises';
import { SvgFormatPlugin } from './index.ts';
import type { FormatWasm } from '@svgnest/format-plugin';
import init, * as wasm from './generated/svg_format_core.js';

export async function loadSvgFormatPlugin(): Promise<SvgFormatPlugin> {
	await init(await readFile(new URL('./generated/svg_format_core_bg.wasm', import.meta.url)));
	return new SvgFormatPlugin(wasm as FormatWasm);
}
