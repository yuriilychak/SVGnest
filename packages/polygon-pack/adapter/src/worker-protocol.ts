import type { NestingConfig, Placement, PlacementResult, PolygonNode, SourcePolygon } from './types.ts';
import { BinaryReader, BinaryWriter, decodeFrame, encodeFrame } from './binary-codec.ts';

const PREPARE_REQUEST = 0x93;
const PREPARED_RESULT = 0x83;
const BEGIN_GENERATION = 5;
const BEGIN_RESULT = 0x85;
const COMPLETE_GENERATION = 6;
const COMPLETE_RESULT = 0x86;
const PLACEMENT_RESULT = 0x87;
const CACHE_STATE = 0x82;
const COORDINATE_SCALE = 100_000;
const SPACING_SHIFT = 7, ROTATIONS_SHIFT = 12, POPULATION_SHIFT = 17, MUTATION_SHIFT = 24, USE_HOLES_MASK = 0x80000000;

function integer(value: number, minimum: number, maximum: number): number | null { return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null; }
function scaled(value: number): number | null { const result = Math.round(value * COORDINATE_SCALE); return Number.isFinite(value) && Number.isSafeInteger(result) && result >= -0x80000000 && result <= 0x7fffffff ? result : null; }
function writePolygon(writer: BinaryWriter, polygon: number[]): boolean {
	if (polygon.length % 2 || !Number.isSafeInteger(polygon.length / 2)) return false;
	writer.u32(polygon.length / 2);
	for (const value of polygon) { const coordinate = scaled(value); if (coordinate === null) return false; writer.i32(coordinate); }
	return true;
}
function readTreeNode(reader: BinaryReader): PolygonNode {
	const source = reader.u32(), points = reader.u32(), childCount = reader.u32();
	if (points < 3) throw new Error('Invalid prepared polygon');
	for (let index = 0; index < points; index++) { reader.i32(); reader.i32(); }
	const children: PolygonNode[] = []; for (let index = 0; index < childCount; index++) children.push(readTreeNode(reader));
	return { source, children };
}

/** Packs the complete GUI configuration into one uint32. */
export function packWorkerConfig(config: NestingConfig): number {
	const curveTolerance = Math.round(config.curveTolerance * 100);
	if (!Number.isFinite(config.curveTolerance) || Math.abs(config.curveTolerance * 100 - curveTolerance) > 1e-9 || integer(curveTolerance, 10, 100) === null || integer(config.spacing, 0, 16) === null || integer(config.rotations, 1, 16) === null || integer(config.populationSize, 3, 64) === null || integer(config.mutationRate, 2, 64) === null) return 0;
	return (curveTolerance | (config.spacing << SPACING_SHIFT) | (config.rotations << ROTATIONS_SHIFT) | (config.populationSize << POPULATION_SHIFT) | (config.mutationRate << MUTATION_SHIFT) | (config.useHoles ? USE_HOLES_MASK : 0)) >>> 0;
}
export function serializePreparationRequest({ bin, parts, workerConfig }: { bin: SourcePolygon; parts: SourcePolygon[]; workerConfig: number }): Uint8Array {
	const writer = new BinaryWriter().u32(workerConfig).u32(parts.length); if (!writePolygon(writer, bin)) return new Uint8Array();
	for (const part of parts) { if (!Number.isSafeInteger(part.source) || part.source < 0 || part.source > 0xffffffff || !writePolygon(writer.u32(part.source), part)) return new Uint8Array(); }
	return encodeFrame(PREPARE_REQUEST, 0, writer.finish());
}
/** Lazily extracts UI metadata, skipping retained geometry coordinates. */
export function deserializePreparationResult(serialized: Uint8Array | null): { bounds: { x: number; y: number; width: number; height: number }; tree: PolygonNode[] } | null {
	try {
		if (!serialized) return null; const frame = decodeFrame(serialized); if (frame.command !== PREPARED_RESULT || frame.flags !== 0) return null;
		const reader = new BinaryReader(frame.payload); const bounds = { x: reader.i32() / COORDINATE_SCALE, y: reader.i32() / COORDINATE_SCALE, width: reader.i32() / COORDINATE_SCALE, height: reader.i32() / COORDINATE_SCALE };
		const binPoints = reader.u32(); if (binPoints < 3) return null; for (let index = 0; index < binPoints; index++) { reader.i32(); reader.i32(); }
		const tree: PolygonNode[] = []; for (let index = 0, roots = reader.u32(); index < roots; index++) tree.push(readTreeNode(reader));
		return reader.remaining === 0 ? { bounds, tree } : null;
	} catch { return null; }
}
function opaque(value: Uint8Array | null, allowEmpty = false): Uint8Array | null { return value instanceof Uint8Array && (allowEmpty || value.byteLength > 0) ? value : null; }
export function emptyCacheState(): Uint8Array { return encodeFrame(CACHE_STATE, 0, new BinaryWriter().u32(0).finish()); }
export function serializeGenerationBegin({ workerConfig, preparation, state, cacheState }: { workerConfig: number; preparation: Uint8Array | null; state: Uint8Array; cacheState: Uint8Array }): Uint8Array {
	const prepared = opaque(preparation), generationState = opaque(state, true), cache = opaque(cacheState); if (!prepared || !generationState || !cache) return new Uint8Array();
	const writer = new BinaryWriter().u32(workerConfig).u32(prepared.byteLength).bytes(prepared).u32(generationState.byteLength).bytes(generationState).u32(cache.byteLength).bytes(cache);
	return encodeFrame(BEGIN_GENERATION, 0, writer.finish());
}
export function deserializeGenerationBegin(serialized: Uint8Array): { continuation: Uint8Array; jobs: Uint8Array[] } | null {
	try { const frame = decodeFrame(serialized); if (frame.command !== BEGIN_RESULT || frame.flags !== 0) return null; const reader = new BinaryReader(frame.payload); const continuation = reader.bytes(reader.u32()).slice(), jobs: Uint8Array[] = []; for (let index = 0, count = reader.u32(); index < count; index++) jobs.push(reader.bytes(reader.u32()).slice()); return reader.remaining === 0 ? { continuation, jobs } : null; } catch { return null; }
}
export function serializeGenerationComplete({ workerConfig, preparation, continuation, results }: { workerConfig: number; preparation: Uint8Array | null; continuation: Uint8Array; results: Uint8Array[] }): Uint8Array {
	const prepared = opaque(preparation); if (!prepared || !opaque(continuation) || results.some((result) => !opaque(result))) return new Uint8Array();
	const writer = new BinaryWriter().u32(workerConfig).u32(prepared.byteLength).bytes(prepared).u32(continuation.byteLength).bytes(continuation).u32(results.length); for (const result of results) writer.u32(result.byteLength).bytes(result);
	return encodeFrame(COMPLETE_GENERATION, 0, writer.finish());
}
function placementReader(serialized: Uint8Array): BinaryReader | null {
	const frame = decodeFrame(serialized);
	return frame.command === PLACEMENT_RESULT && frame.flags === 0 ? new BinaryReader(frame.payload) : null;
}
export function placementFitness(serialized: Uint8Array): number | null { try { return placementReader(serialized)?.f64() ?? null; } catch { return null; } }
export function deserializePlacement(serialized: Uint8Array, partCount: number): PlacementResult | null {
	try {
		const reader = placementReader(serialized); if (!reader) return null; const fitness = reader.f64(), placedArea = reader.f64(), binArea = reader.f64(), binCount = reader.u32(); if (!Number.isFinite(fitness)) return null;
		const placements: Placement[][] = []; let placedCount = 0;
		for (let binIndex = 0; binIndex < binCount; binIndex++) { const count = reader.u32(); placedCount += count; const bin: Placement[] = []; for (let index = 0; index < count; index++) bin.push({ id: reader.u32(), x: reader.f32(), y: reader.f32(), rotation: reader.f32() }); placements.push(bin); }
		return reader.remaining === 0 ? { fitness, placements, placedArea, totalArea: binArea * binCount, placedCount, partCount } : null;
	} catch { return null; }
}
export function deserializeGenerationComplete(serialized: Uint8Array): { state: Uint8Array; cacheState: Uint8Array; partCount: number; fitness: number; placement: Uint8Array } | null {
	try { const frame = decodeFrame(serialized); if (frame.command !== COMPLETE_RESULT || frame.flags !== 0) return null; const reader = new BinaryReader(frame.payload), state = reader.bytes(reader.u32()).slice(), cacheState = reader.bytes(reader.u32()).slice(), partCount = reader.u32(), placement = reader.bytes(reader.u32()).slice(), fitness = placementFitness(placement); return reader.remaining === 0 && fitness !== null ? { state, cacheState, partCount, fitness, placement } : null; } catch { return null; }
}
