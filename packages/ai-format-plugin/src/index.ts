import { decodeInputPolygons, decodeSvgDocuments, encodePlacementOutput, type FormatInput, type FormatPlugin, type FormatResult, type InputPolygons, type PlacementOutput, type SvgDocuments } from '@svgnest/format-plugin';

export type AiFormat = 'pdf-compatible' | 'legacy-eps' | 'unknown';
export interface AiFormatConfig { curveTolerance: number; }

/** Narrow WASM seam for the first AI-plugin increment. */
export interface AiFormatWasm {
	input_to_svg(input: Uint8Array): string;
	input_to_polygons(input: Uint8Array, tolerance: number): Uint8Array;
	output_to_svg(input: Uint8Array, placementData: Uint8Array): Uint8Array;
	output_to_data(input: Uint8Array, placementData: Uint8Array): Uint8Array;
}

/** Accepts PDF-compatible Illustrator files (AI 9+) only. */
export class AiFormatPlugin implements FormatPlugin<FormatInput, AiFormatConfig, Uint8Array> {
	readonly id = 'ai';
	readonly extensions = ['.ai'] as const;

	constructor(private readonly wasm: AiFormatWasm) {}

	detect(input: string | Uint8Array): AiFormat {
		const bytes = this.bytes(input);
		return startsWith(bytes, '%PDF-') ? 'pdf-compatible' : startsWith(bytes, '%!PS') ? 'legacy-eps' : 'unknown';
	}

	/** Rejects legacy and invalid files before invoking the PDF/WASM parser. */
	validate(input: string | Uint8Array): AiFormat {
		const format = this.detect(input);
		if (format === 'legacy-eps') throw new Error('Legacy PostScript/EPS Illustrator files are not supported. Open the file in Illustrator and save it as a PDF-compatible AI file (Illustrator 9 or later).');
		if (format !== 'pdf-compatible') throw new Error('Unsupported Adobe Illustrator container. Expected a PDF-compatible AI file.');
		return format;
	}

	private toSvg(input: FormatInput): string {
		const bytes = this.bytes(input); this.validate(bytes);
		return this.wasm.input_to_svg(bytes);
	}

	async inputToSvg(input: FormatInput, _config: AiFormatConfig): Promise<FormatResult<string>> {
		return { value: this.toSvg(input), diagnostics: [] };
	}

	async inputToPolygons(input: FormatInput, config: AiFormatConfig): Promise<FormatResult<InputPolygons>> {
		const bytes = this.bytes(input); this.validate(bytes);
		return { value: decodeInputPolygons(this.wasm.input_to_polygons(bytes, config.curveTolerance)), diagnostics: [] };
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		const bytes = this.bytes(input); this.validate(bytes);
		return { value: decodeSvgDocuments(this.wasm.output_to_svg(bytes, encodePlacementOutput(placing))), diagnostics: [] };
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<Uint8Array>> {
		const bytes = this.bytes(input); this.validate(bytes);
		return { value: this.wasm.output_to_data(bytes, encodePlacementOutput(placing)), diagnostics: [] };
	}

	private bytes(input: FormatInput) { return typeof input === 'string' ? new TextEncoder().encode(input) : input; }
}

function startsWith(bytes: Uint8Array, value: string): boolean {
	const prefix = new TextEncoder().encode(value);
	return bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);
}

export { loadAiFormatPlugin } from './wasm-loader.ts';
