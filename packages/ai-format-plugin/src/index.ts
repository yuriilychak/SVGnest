import type { FormatInput, FormatPlugin, FormatResult, InputPolygons, PlacementOutput, SvgDocuments } from '@svgnest/format-plugin';
import { SvgFormatPlugin, type SvgFormatConfig, decodePolygons } from '@svgnest/svg-format-plugin';

export type AiFormat = 'pdf-compatible' | 'legacy-eps' | 'unknown';

/** Narrow WASM seam for the first AI-plugin increment. */
export interface AiFormatWasm {
	detect_ai_format(input: Uint8Array): AiFormat;
	validate_ai(input: Uint8Array): AiFormat;
	input_to_svg(input: Uint8Array): string;
	input_to_polygons(input: Uint8Array, tolerance: number): string;
}

/** Detects the two Illustrator container families before invoking a parser. */
export class AiFormatPlugin implements FormatPlugin<FormatInput, SvgFormatConfig, SvgDocuments> {
	readonly id = 'ai';
	readonly extensions = ['.ai'] as const;

	constructor(private readonly wasm: AiFormatWasm, private readonly svg: SvgFormatPlugin) {}

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

	private toPolygons(input: FormatInput, curveTolerance: number): string {
		return this.wasm.input_to_polygons(typeof input === 'string' ? new TextEncoder().encode(input) : input, curveTolerance);
	}

	async inputToSvg(input: FormatInput, _config: SvgFormatConfig): Promise<FormatResult<string>> {
		return { value: this.toSvg(input), diagnostics: [] };
	}

	async inputToPolygons(input: FormatInput, config: SvgFormatConfig): Promise<FormatResult<InputPolygons>> {
		const payload = decodePolygons(this.toPolygons(input, config.curveTolerance));
		return { value: { polygons: payload.polygons.map(({ source, points }) => Object.assign([...points], { source })), sources: payload.sources }, diagnostics: [] };
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return this.svg.outputToSvg(this.toSvg(input), placing);
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return this.outputToSvg(input, placing);
	}
}
