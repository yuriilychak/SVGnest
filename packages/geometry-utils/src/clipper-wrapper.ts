import type { BoundRect, PolygonNode } from './types';
import { getPolygonNode, deserializeNodes } from './helpers';
import { PolygonF32 } from './geometry';
import { clean_node_inner_wasm, offset_node_inner_wasm, generate_tree_wasm } from 'wasm-nesting';

export function generateBounds(memSeg: Float32Array, spacing: number, curveTolerance: number): {
    binNode: PolygonNode;
    bounds: BoundRect<Float32Array>;
    resultBounds: BoundRect<Float32Array>;
    area: number;
} {
    if (memSeg.length < 6) {
        return null;
    }

    const polygon = new PolygonF32();
    polygon.bind(memSeg);

    const binNode: PolygonNode = getPolygonNode(-1, memSeg);
    const bounds: BoundRect<Float32Array> = polygon.exportBounds();

    cleanNode(binNode, curveTolerance);
    offsetNode(binNode, -1, spacing, curveTolerance);

    polygon.bind(binNode.memSeg);
    polygon.resetPosition();

    const resultBounds = polygon.exportBounds();
    const area: number = polygon.area;

    return { binNode, bounds, resultBounds, area };
}

function offsetNode(node: PolygonNode, sign: number, spacing: number, curveTolerance: number): void {
    node.memSeg = offset_node_inner_wasm(node.memSeg, sign, spacing, curveTolerance);
}


function cleanNode(node: PolygonNode, curveTolerance: number): void {
    const res = clean_node_inner_wasm(node.memSeg, curveTolerance);

    if (res.length) {
        node.memSeg = res;
    }
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
