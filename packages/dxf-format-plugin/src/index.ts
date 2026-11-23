import {
	encodePlacementOutput,
	decodeInputPolygons,
	decodeSvgDocuments,
	type FormatInput,
	type FormatDiagnostic,
	type FormatWasm,
	type FormatPlugin,
	type FormatResult,
	type InputPolygons,
	type PlacementOutput,
	type SvgDocuments,
} from '@svgnest/format-plugin';

export interface DxfFormatConfig { curveTolerance: number; }

/** Complete ASCII DXF implementation of the shared format-plugin contract. */
export class DxfFormatPlugin implements FormatPlugin<FormatInput, DxfFormatConfig, Uint8Array> {
	readonly id = 'dxf';
	readonly extensions = ['.dxf'] as const;

	constructor(private readonly wasm: FormatWasm) {}

	async inputToSvg(input: FormatInput, _config: DxfFormatConfig): Promise<FormatResult<string>> {
		return { value: this.wasm.input_to_svg(bytes(input)), diagnostics: diagnostics(input) };
	}

	async inputToPolygons(input: FormatInput, config: DxfFormatConfig): Promise<FormatResult<InputPolygons>> {
		return { value: decodeInputPolygons(this.wasm.input_to_polygons(bytes(input), config.curveTolerance)), diagnostics: diagnostics(input) };
	}

	async outputToSvg(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<SvgDocuments>> {
		return { value: decodeSvgDocuments(this.wasm.output_to_svg(bytes(input), encodePlacementOutput(placing))), diagnostics: [] };
	}

	async outputToData(input: FormatInput, placing: PlacementOutput): Promise<FormatResult<Uint8Array>> {
		return { value: this.wasm.output_to_data(bytes(input), encodePlacementOutput(placing)), diagnostics: [] };
	}
}

function bytes(input: FormatInput): Uint8Array { return typeof input === 'string' ? new TextEncoder().encode(input) : input; }
function diagnostics(input: FormatInput): FormatDiagnostic[] {
	const text = typeof input === 'string' ? input : new TextDecoder().decode(input);
	const unsupported = ['HATCH', 'MESH', 'POLYFACEMESH', '3DFACE', 'SOLID', 'REGION'].filter(kind => new RegExp(`^\\s*0\\s*\\r?\\n\\s*${kind}\\s*$`, 'mi').test(text));
	return unsupported.map(kind => ({ level: 'warning', code: `dxf-unsupported-${kind.toLowerCase()}`, message: `${kind} entities are ignored because they cannot yet be nested safely.` }));
}
export { loadDxfFormatPlugin } from './loader.ts';
