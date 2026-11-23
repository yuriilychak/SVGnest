import {
	encodePlacementOutput,
	decodeInputPolygons,
	decodeSvgDocuments,
	type FormatInput,
	type FormatPlugin,
	type FormatResult,
	type InputPolygons,
	type PlacementOutput,
	type SvgDocuments,
} from '@svgnest/format-plugin';

export interface DxfFormatConfig { curveTolerance: number; }

/** The Rust/WASM DXF conversion and SVGnest rendering surface. */
export interface DxfFormatWasm {
	input_to_svg(input: Uint8Array): string;
	input_to_polygons(input: Uint8Array, tolerance: number): Uint8Array;
	output_to_svg(input: Uint8Array, placementData: Uint8Array): Uint8Array;
	output_to_data(input: Uint8Array, placementData: Uint8Array): Uint8Array;
}

/** Complete ASCII DXF implementation of the shared format-plugin contract. */
export class DxfFormatPlugin implements FormatPlugin<FormatInput, DxfFormatConfig, Uint8Array> {
	readonly id = 'dxf';
	readonly extensions = ['.dxf'] as const;

	constructor(private readonly wasm: DxfFormatWasm) {}

	async inputToSvg(input: FormatInput, _config: DxfFormatConfig): Promise<FormatResult<string>> {
		return { value: this.wasm.input_to_svg(bytes(input)), diagnostics: [] };
	}

	async inputToPolygons(input: FormatInput, config: DxfFormatConfig): Promise<FormatResult<InputPolygons>> {
		return { value: decodeInputPolygons(this.wasm.input_to_polygons(bytes(input), config.curveTolerance)), diagnostics: [] };
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return { value: decodeSvgDocuments(this.wasm.output_to_svg(bytes(input), encodePlacementOutput(placing))), diagnostics: [] };
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<Uint8Array>> {
		return { value: this.wasm.output_to_data(bytes(input), encodePlacementOutput(placing)), diagnostics: [] };
	}
}

function bytes(input: FormatInput): Uint8Array { return typeof input === 'string' ? new TextEncoder().encode(input) : input; }
export { loadDxfFormatPlugin } from './loader.ts';
