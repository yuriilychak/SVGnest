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

const INPUT_POLYGONS_MAGIC = [0x53, 0x4e, 0x50, 0x32]; // "SNP2"
const SVG_DOCUMENTS_MAGIC = [0x53, 0x4e, 0x50, 0x33]; // "SNP3"

/** Decodes the common Rust/WASM polygon payload used by every format plugin.
 * Layout: magic, polygon count, then source index, point count, and f64 pairs. */
export function decodeInputPolygons(bytes: Uint8Array): InputPolygons {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 0;
	const take = (size: number): void => { if (offset + size > view.byteLength) throw new Error('Format core returned truncated polygon data'); };
	const u32 = (): number => { take(4); const value = view.getUint32(offset, true); offset += 4; return value; };
	const f64 = (): number => { take(8); const value = view.getFloat64(offset, true); offset += 8; if (!Number.isFinite(value)) throw new Error('Format core returned non-finite polygon coordinates'); return value; };
	take(INPUT_POLYGONS_MAGIC.length);
	if (!INPUT_POLYGONS_MAGIC.every((value, index) => bytes[index] === value)) throw new Error('Format core returned polygon data with an invalid header');
	offset += INPUT_POLYGONS_MAGIC.length;
	const count = u32(); const polygons: SourcePolygon[] = [];
	for (let index = 0; index < count; index++) {
		const source = u32(); const length = u32();
		if (length % 2) throw new Error('Format core returned an odd polygon coordinate count');
		const polygon = Array.from({ length }, f64) as SourcePolygon; polygon.source = source; polygons.push(polygon);
	}
	if (offset !== view.byteLength) throw new Error('Format core returned polygon data with trailing bytes');
	return { polygons, sources: polygons.map(polygon => polygon.source) };
}

/** Decodes the common Rust/WASM UTF-8 SVG-document payload used by format adapters. */
export function decodeSvgDocuments(bytes: Uint8Array): SvgDocuments {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 0;
	const take = (size: number): Uint8Array => { if (offset + size > bytes.byteLength) throw new Error('Format core returned truncated SVG document data'); const value = bytes.subarray(offset, offset + size); offset += size; return value; };
	const u32 = (): number => { const value = take(4); return new DataView(value.buffer, value.byteOffset, 4).getUint32(0, true); };
	const magic = take(SVG_DOCUMENTS_MAGIC.length);
	if (!SVG_DOCUMENTS_MAGIC.every((value, index) => magic[index] === value)) throw new Error('Format core returned SVG document data with an invalid header');
	const count = u32(); const decoder = new TextDecoder('utf-8', { fatal: true }); const documents: string[] = [];
	try { for (let index = 0; index < count; index++) documents.push(decoder.decode(take(u32()))); } catch { throw new Error('Format core returned invalid UTF-8 SVG document data'); }
	if (offset !== bytes.byteLength) throw new Error('Format core returned SVG document data with trailing bytes');
	return { documents };
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
