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

const PLACEMENT_MAGIC = [0x53, 0x4e, 0x50, 0x31]; // "SNP1"

/** Encodes placement data for the Rust/WASM renderer without a JSON boundary. */
export function encodePlacementOutput(output: PlacementOutput): Uint8Array {
	const treeSize = (node: PolygonNode): number => 5 + (node.source === undefined ? 0 : 4) + node.children.reduce((size, child) => size + treeSize(child), 0);
	// magic + bin source + four bounds + tree count + sheet count
	const size = 48 + output.tree.reduce((total, node) => total + treeSize(node), 0)
		+ output.placements.reduce((total, sheet) => total + 4 + sheet.length * 28, 0);
	const bytes = new Uint8Array(size);
	const view = new DataView(bytes.buffer);
	let offset = 0;
	const u32 = (value: number) => { if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new Error('Placement contains an invalid integer'); view.setUint32(offset, value, true); offset += 4; };
	const f64 = (value: number) => { if (!Number.isFinite(value)) throw new Error('Placement contains a non-finite coordinate'); view.setFloat64(offset, value, true); offset += 8; };
	const node = (value: PolygonNode): void => {
		if (value.source === undefined) bytes[offset++] = 0; else { bytes[offset++] = 1; u32(value.source); }
		u32(value.children.length); value.children.forEach(node);
	};
	bytes.set(PLACEMENT_MAGIC, offset); offset += PLACEMENT_MAGIC.length;
	u32(output.binSource); f64(output.binBounds.x); f64(output.binBounds.y); f64(output.binBounds.width); f64(output.binBounds.height);
	u32(output.tree.length); output.tree.forEach(node);
	u32(output.placements.length);
	for (const sheet of output.placements) { u32(sheet.length); for (const placement of sheet) { u32(placement.id); f64(placement.x); f64(placement.y); f64(placement.rotation); } }
	return bytes;
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
	/** Persist a format-specific binary representation from source input and
	 * placement data. Implementations encode placement data for Rust/WASM. */
	outputToData(input: Input, placing: PlacementOutput): Promise<FormatResult<Data>>;
	outputToSvg(input: Input, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>>;
}
