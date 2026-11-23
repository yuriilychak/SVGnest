import {
	encodePlacementOutput,
	type FormatInput,
	type FormatPlugin,
	type FormatResult,
	type InputPolygons,
	type PlacementOutput,
	type SourcePolygon,
	type SvgDocuments,
} from '@svgnest/format-plugin';

export interface DxfFormatConfig { curveTolerance: number; }

/** The Rust/WASM DXF conversion and SVGnest rendering surface. */
export interface DxfFormatWasm {
	input_to_svg(input: Uint8Array): string;
	input_to_polygons(input: Uint8Array, tolerance: number): string;
	output_to_svg(input: Uint8Array, placementData: Uint8Array): string;
}

/** Complete ASCII DXF implementation of the shared format-plugin contract. */
export class DxfFormatPlugin implements FormatPlugin<FormatInput, DxfFormatConfig, SvgDocuments> {
	readonly id = 'dxf';
	readonly extensions = ['.dxf'] as const;

	constructor(private readonly wasm: DxfFormatWasm) {}

	async inputToSvg(input: FormatInput, _config: DxfFormatConfig): Promise<FormatResult<string>> {
		return { value: this.wasm.input_to_svg(bytes(input)), diagnostics: [] };
	}

	async inputToPolygons(input: FormatInput, config: DxfFormatConfig): Promise<FormatResult<InputPolygons>> {
		const payload = decodePolygons(this.wasm.input_to_polygons(bytes(input), config.curveTolerance));
		return { value: { polygons: payload.polygons.map(({ source, points }) => withSource(points, source)), sources: payload.sources }, diagnostics: [] };
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return { value: decodeDocuments(this.wasm.output_to_svg(bytes(input), encodePlacementOutput(placing))), diagnostics: [] };
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> { return this.outputToSvg(input, placing); }
}

type PolygonPayload = { polygons: Array<{ source: number; points: number[] }>; sources: number[] };
function bytes(input: FormatInput): Uint8Array { return typeof input === 'string' ? new TextEncoder().encode(input) : input; }
function withSource(points: number[], source: number): SourcePolygon {
	if (!Number.isSafeInteger(source) || source < 0 || points.length % 2 || points.some(point => !Number.isFinite(point))) throw new Error('Rust DXF core returned an invalid polygon payload');
	const polygon = [...points] as SourcePolygon; polygon.source = source; return polygon;
}
function decodePolygons(payload: string): PolygonPayload {
	let value: unknown; try { value = JSON.parse(payload); } catch { throw new Error('Rust DXF core returned malformed polygon JSON'); }
	if (!value || typeof value !== 'object') throw new Error('Rust DXF core returned an invalid polygon payload');
	const { polygons, sources } = value as Partial<PolygonPayload>;
	if (!Array.isArray(polygons) || !Array.isArray(sources)) throw new Error('Rust DXF core returned an invalid polygon payload');
	return { polygons, sources };
}
function decodeDocuments(payload: string): SvgDocuments {
	let value: unknown; try { value = JSON.parse(payload); } catch { throw new Error('Rust DXF core returned malformed output JSON'); }
	if (!value || typeof value !== 'object' || !Array.isArray((value as Partial<SvgDocuments>).documents)) throw new Error('Rust DXF core returned an invalid output payload');
	const documents = (value as SvgDocuments).documents;
	if (documents.some(document => typeof document !== 'string')) throw new Error('Rust DXF core returned an invalid SVG document');
	return { documents };
}

export { loadDxfFormatPlugin } from './loader.ts';
