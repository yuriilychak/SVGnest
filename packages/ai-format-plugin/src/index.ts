import type { FormatInput, FormatPlugin, FormatResult, InputPolygons, PlacementOutput, SvgDocuments } from '@svgnest/format-plugin';
import { SvgFormatPlugin, type SvgFormatConfig } from '@svgnest/svg-format-plugin';

export type AiFormat = 'pdf-compatible' | 'legacy-eps' | 'unknown';

/** Narrow WASM seam for the first AI-plugin increment. */
export interface AiFormatWasm {
	detect_ai_format(input: Uint8Array): AiFormat;
	validate_ai(input: Uint8Array): AiFormat;
	input_to_svg(input: Uint8Array): string;
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

	async inputToSvg(input: FormatInput, config: SvgFormatConfig): Promise<FormatResult<string>> {
		return this.svg.inputToSvg(this.toSvg(input), config);
	}

	async inputToPolygons(input: FormatInput, config: SvgFormatConfig): Promise<FormatResult<InputPolygons>> {
		return this.svg.inputToPolygons(this.toSvg(input), config);
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return this.svg.outputToSvg(this.toSvg(input), placing);
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return this.outputToSvg(input, placing);
	}
}

export { loadAiFormatPlugin } from './wasm-loader.ts';
