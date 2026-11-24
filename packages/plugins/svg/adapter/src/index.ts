import {
	encodePlacementOutput,
	decodeInputPolygons,
	decodeSvgDocuments,
	type FormatDiagnostic,
	type FormatInput,
	type FormatWasm,
	type FormatPlugin,
	type FormatResult,
	type InputPolygons,
	type PlacementOutput,
	type SvgDocuments,
} from '@svgnest/format-plugin';

export interface SvgFormatConfig {
	curveTolerance: number;
}

/**
 * DOM-free base adapter for Rust input conversion. SvgFormatPlugin extends it
 * with the Rust placement-output methods.
 */
export class SvgInputAdapter {
	readonly id = 'svg';
	readonly extensions = ['.svg'] as const;

	constructor(protected readonly wasm: FormatWasm) {}

	async inputToSvg(input: FormatInput, _config: SvgFormatConfig): Promise<FormatResult<string>> {
		return { value: this.wasm.input_to_svg(toUtf8(input)), diagnostics: [] };
	}

	async inputToPolygons(input: FormatInput, config: SvgFormatConfig): Promise<FormatResult<InputPolygons>> {
		return { value: decodeInputPolygons(this.wasm.input_to_polygons(toUtf8(input), config.curveTolerance)), diagnostics: [] };
	}
}

/**
 * Complete SVG implementation of the format-plugin contract. SVG output is
 * already the persisted representation, so both methods use the same renderer.
 */
export class SvgFormatPlugin extends SvgInputAdapter implements FormatPlugin<FormatInput, SvgFormatConfig, SvgDocuments> {
	constructor(wasm: FormatWasm) {
		super(wasm);
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return { value: decodeSvgDocuments(this.wasm.output_to_svg(toUtf8(input), encodePlacementOutput(placing))), diagnostics: [] };
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return { value: decodeSvgDocuments(this.wasm.output_to_data(toUtf8(input), encodePlacementOutput(placing))), diagnostics: [] };
	}
}

function toUtf8(input: FormatInput): Uint8Array {
	return typeof input === 'string' ? new TextEncoder().encode(input) : input;
}

export { loadSvgFormatPlugin } from './wasm-loader.ts';
export type { FormatDiagnostic };
