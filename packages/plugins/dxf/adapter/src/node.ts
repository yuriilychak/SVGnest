import { readFile } from 'node:fs/promises';
import { DxfFormatPlugin } from './index.ts';
import type { FormatWasm } from '@svgnest/format-plugin';
import init, * as wasm from './generated/dxf_format_core.js';

export async function loadDxfFormatPlugin(): Promise<DxfFormatPlugin> {
	await init(await readFile(new URL('./generated/dxf_format_core_bg.wasm', import.meta.url)));
	return new DxfFormatPlugin(wasm as FormatWasm);
}
