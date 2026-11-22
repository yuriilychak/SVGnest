export type AiFormat = 'pdf-compatible' | 'legacy-eps' | 'unknown';

/** Narrow WASM seam for the first AI-plugin increment. */
export interface AiFormatWasm {
	detect_ai_format(input: Uint8Array): AiFormat;
	validate_ai(input: Uint8Array): AiFormat;
}

/** Detects the two Illustrator container families before invoking a parser. */
export class AiFormatPlugin {
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
}
