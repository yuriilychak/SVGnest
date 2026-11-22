/**
 * The application-facing boundary for import/export formats.  Implementations
 * must be DOM-free: inputs and outputs are serializable data, while any DOM
 * work is limited to rendering the returned SVG as an opaque browser resource.
 */

export type FormatInput = string | Uint8Array;

/** Flat [x0, y0, x1, y1, …] contour with its stable source-artwork index. */
export interface SourcePolygon extends Array<number> {
	source: number;
}

export interface InputPolygons {
	polygons: SourcePolygon[];
	/** Indices that can be selected as a bin and rendered by this plugin. */
	sources: readonly number[];
}

export interface Placement {
	id: number;
	x: number;
	y: number;
	rotation: number;
}

export interface PolygonNode {
	source?: number;
	children: PolygonNode[];
}

/** The complete non-format-specific result needed to render a nesting run. */
export interface PlacementOutput {
	placements: Placement[][];
	tree: PolygonNode[];
	binBounds: { x: number; y: number; width: number; height: number };
	binSource: number;
}

/** A single SVG document per output sheet, in deterministic sheet order. */
export interface SvgDocuments {
	documents: string[];
}

export interface FormatDiagnostic {
	level: 'warning' | 'error';
	code: string;
	message: string;
	source?: number;
}

export interface FormatResult<T> {
	value: T;
	diagnostics: FormatDiagnostic[];
}

export interface FormatPlugin<Input = FormatInput, Config = unknown, Data = Input> {
	readonly id: string;
	readonly extensions: readonly string[];
	inputToPolygons(input: Input, config: Config): Promise<FormatResult<InputPolygons>>;
	inputToSvg(input: Input, config: Config): Promise<FormatResult<string>>;
	/** Persist SVG documents already rendered by `outputToSvg`; implementations
	 * may encode them into a format-specific binary representation. */
	outputToData(documents: SvgDocuments): Promise<FormatResult<Data>>;
	outputToSvg(input: Input, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>>;
}
