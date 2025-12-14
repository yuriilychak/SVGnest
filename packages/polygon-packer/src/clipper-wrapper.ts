import { generate_tree_wasm, generate_bounds_wasm } from 'wasm-nesting';
import type { BoundRect, PolygonNode } from './types';
import { deserializeNodes } from './helpers';
import { BoundRectF32 } from './geometry';

export function generateBounds(memSeg: Float32Array, spacing: number, curveTolerance: number): {
    binNode: PolygonNode;
    bounds: BoundRect<Float32Array>;
    resultBounds: BoundRect<Float32Array>;
    area: number;
} | null {
    if (memSeg.length < 6) {
        return null;
    }

    // Call WASM function
    const result = generate_bounds_wasm(memSeg, spacing, curveTolerance);

    if (result.length === 0) {
        return null;
    }

    // Extract bounds data using BoundRectF32
    const bounds = new BoundRectF32(result[0], result[1], result[2], result[3]);
    const resultBounds = new BoundRectF32(result[4], result[5], result[6], result[7]);
    const area = result[8];

    // Deserialize node from remaining bytes
    const serializedBytes = new Uint8Array(result.buffer, 36).slice(); // Start after 9 floats (36 bytes)
    const buffer = serializedBytes.buffer as ArrayBuffer;
    const view = new DataView(buffer, 0);
    const nodeCount = view.getUint32(0, true); // true = little-endian
    const nodes = new Array<PolygonNode>(nodeCount);


    deserializeNodes(nodes, view, buffer, 4);

    const binNode = nodes[0];

    return { binNode, bounds, resultBounds, area };
}

export function generateTree(memSegs: Float32Array[], spacing: number, curveTolerance: number): PolygonNode[] {
    // Flatten memSegs into a single Float32Array and create sizes array
    let totalLength = 0;
    const sizes = new Uint16Array(memSegs.length);

    for (let i = 0; i < memSegs.length; i++) {
        sizes[i] = memSegs[i].length >> 1; // Store point count (length / 2)
        totalLength += memSegs[i].length;
    }

    const values = new Float32Array(totalLength);
    let offset = 0;

    for (const memSeg of memSegs) {
        values.set(memSeg, offset);
        offset += memSeg.length;
    }

    // Call WASM function
    const serialized = generate_tree_wasm(values, sizes, spacing, curveTolerance);

    // Deserialize result
    const buffer = serialized.buffer as ArrayBuffer;
    const view = new DataView(buffer);
    const rootCount = view.getUint32(0, true); // true = little-endian
    const nodes = new Array<PolygonNode>(rootCount);

    deserializeNodes(nodes, view, buffer, 4); // Start after the u32 count (4 bytes)

    return nodes;
}
