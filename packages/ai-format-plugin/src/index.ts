import type { FormatInput, FormatPlugin, FormatResult, InputPolygons, PlacementOutput, SourcePolygon, SvgDocuments } from '@svgnest/format-plugin';

export type AiFormat = 'pdf-compatible' | 'legacy-eps' | 'unknown';
export interface AiFormatConfig { curveTolerance: number; }

/** Narrow WASM seam for the first AI-plugin increment. */
export interface AiFormatWasm {
	detect_ai_format(input: Uint8Array): AiFormat;
	validate_ai(input: Uint8Array): AiFormat;
	input_to_svg(input: Uint8Array): string;
	input_to_polygons(input: Uint8Array, tolerance: number): string;
	output_to_svg(input: Uint8Array, placementJson: string): string;
}

/** Detects the two Illustrator container families before invoking a parser. */
export class AiFormatPlugin implements FormatPlugin<FormatInput, AiFormatConfig, SvgDocuments> {
	readonly id = 'ai';
	readonly extensions = ['.ai'] as const;

	constructor(private readonly wasm: AiFormatWasm) {}

	detect(input: string | Uint8Array): AiFormat {
		return this.wasm.detect_ai_format(typeof input === 'string' ? new TextEncoder().encode(input) : input);
	}

	/** Parses the container and throws an actionable error for unsupported artwork. */
	validate(input: string | Uint8Array): AiFormat {
		return this.wasm.validate_ai(typeof input === 'string' ? new TextEncoder().encode(input) : input);
	}

	private toSvg(input: FormatInput): string {
		return this.wasm.input_to_svg(typeof input === 'string' ? new TextEncoder().encode(input) : input);
	}

	async inputToSvg(input: FormatInput, _config: AiFormatConfig): Promise<FormatResult<string>> {
		return { value: this.toSvg(input), diagnostics: [] };
	}

	async inputToPolygons(input: FormatInput, config: AiFormatConfig): Promise<FormatResult<InputPolygons>> {
		const payload = JSON.parse(this.wasm.input_to_polygons(this.bytes(input), config.curveTolerance));
		const polygons = payload.polygons.map(({ source, points }: { source: number; points: number[] }) => Object.assign(points, { source }) as SourcePolygon);
		return { value: { polygons, sources: payload.sources }, diagnostics: [] };
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		const value = JSON.parse(this.wasm.output_to_svg(this.bytes(input), JSON.stringify(placing))) as SvgDocuments;
		return { value, diagnostics: [] };
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return this.outputToSvg(input, placing);
	}

	private bytes(input: FormatInput) { return typeof input === 'string' ? new TextEncoder().encode(input) : input; }
}

export { loadAiFormatPlugin } from './wasm-loader.ts';
