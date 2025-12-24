import { set_bits_u32, generate_nfp_cache_key_wasm } from 'wasm-nesting';
import { NestConfig, NFPCache, PolygonNode } from './types';

export function generateNFPCacheKey(
    rotationSplit: number,
    inside: boolean,
    polygon1: PolygonNode,
    polygon2: PolygonNode
): number {
    return generate_nfp_cache_key_wasm(
        rotationSplit,
        inside,
        polygon1.source,
        polygon1.rotation,
        polygon2.source,
        polygon2.rotation
    );
}

function calculateTotalSize(nodes: PolygonNode[], initialSize: number): number {
    return nodes.reduce<number>((result: number, node: PolygonNode) => {
        const nodeSize = (Uint32Array.BYTES_PER_ELEMENT << 2) + node.memSeg.byteLength;
        const newResult = result + nodeSize;

        return calculateTotalSize(node.children, newResult);
    }, initialSize);
}

function serializeNodes(nodes: PolygonNode[], buffer: ArrayBuffer, view: DataView, offset: number): number {
    return nodes.reduce((result: number, node: PolygonNode) => {
        view.setUint32(result, node.source + 1);
        result += Uint32Array.BYTES_PER_ELEMENT;
        view.setFloat32(result, node.rotation);
        result += Uint32Array.BYTES_PER_ELEMENT;

        const memSegLength = node.memSeg.length;
        view.setUint32(result, memSegLength >> 1);
        result += Uint32Array.BYTES_PER_ELEMENT;

        const memSegBytes = new Uint8Array(node.memSeg.buffer, node.memSeg.byteOffset, node.memSeg.byteLength);
        new Uint8Array(buffer, result).set(memSegBytes);
        result += memSegBytes.byteLength;

        const childrenCount = node.children.length;
        view.setUint32(result, childrenCount);
        result += Uint32Array.BYTES_PER_ELEMENT;

        return serializeNodes(node.children, buffer, view, result);
    }, offset);
}

export function deserializeNodes(nodes: PolygonNode[], view: DataView, buffer: ArrayBuffer, initialOffset: number): number {
    const nodeCount: number = nodes.length;
    let offset: number = initialOffset;
    let memSegLength: number = 0;
    let childrenCount: number = 0;
    let source: number = 0;
    let rotation: number = 0;
    let memSeg: Float32Array = null;
    let children: PolygonNode[] = null;
    let i: number = 0;

    for (i = 0; i < nodeCount; ++i) {
        source = view.getUint32(offset, true) - 1; // true = little-endian
        offset += Uint32Array.BYTES_PER_ELEMENT;
        rotation = view.getFloat32(offset, true); // true = little-endian
        offset += Uint32Array.BYTES_PER_ELEMENT;
        memSegLength = view.getUint32(offset, true) << 1; // true = little-endian
        offset += Uint32Array.BYTES_PER_ELEMENT;

        // Copy Float32 data to ensure proper alignment
        memSeg = new Float32Array(memSegLength);
        for (let j = 0; j < memSegLength; j++) {
            memSeg[j] = view.getFloat32(offset, true); // true = little-endian
            offset += Float32Array.BYTES_PER_ELEMENT;
        }

        childrenCount = view.getUint32(offset, true); // true = little-endian
        offset += Uint32Array.BYTES_PER_ELEMENT;
        children = new Array(childrenCount);
        offset = deserializeNodes(children, view, buffer, offset);
        nodes[i] = { source, rotation, memSeg, children };
    }

    return offset;
}

export function serializePolygonNodes(nodes: PolygonNode[], offset: number = 0): ArrayBuffer {
    const initialOffset = Uint32Array.BYTES_PER_ELEMENT + offset;
    const totalSize: number = calculateTotalSize(nodes, initialOffset);
    const buffer: ArrayBuffer = new ArrayBuffer(totalSize);
    const view: DataView = new DataView(buffer);

    view.setUint32(offset, nodes.length);

    serializeNodes(nodes, buffer, view, initialOffset);

    return buffer;
}

export function serializeConfig(config: NestConfig): number {
    let result: number = 0;

    // Кодуємо значення в число
    result = set_bits_u32(result, config.curveTolerance * 10, 0, 4);
    result = set_bits_u32(result, config.spacing, 4, 5);
    result = set_bits_u32(result, config.rotations, 9, 5);
    result = set_bits_u32(result, config.populationSize, 14, 7);
    result = set_bits_u32(result, config.mutationRate, 21, 7);
    result = set_bits_u32(result, Number(config.useHoles), 28, 1);

    return result;
}

export function serializeMapToBuffer(map: NFPCache): ArrayBuffer {
    const totalSize: number = Array.from(map.values()).reduce(
        (acc, buffer) => acc + (Uint32Array.BYTES_PER_ELEMENT << 1) + buffer.byteLength,
        0
    );
    const resultBuffer: ArrayBuffer = new ArrayBuffer(totalSize);
    const view: DataView = new DataView(resultBuffer);
    const entries = Array.from(map.entries());
    let length: number = 0;

    entries.reduce((offset, [key, buffer]) => {
        view.setUint32(offset, key);
        offset += Uint32Array.BYTES_PER_ELEMENT;
        length = buffer.byteLength;
        view.setUint32(offset, length);
        offset += Uint32Array.BYTES_PER_ELEMENT;

        new Uint8Array(resultBuffer, offset).set(new Uint8Array(buffer));

        return offset + length;
    }, 0);

    return resultBuffer;
}

function getByteOffset(array: Float32Array, index: number): number {
    return (array.byteOffset >>> 0) + index * Float32Array.BYTES_PER_ELEMENT;
}

export function readUint32FromF32(array: Float32Array, index: number): number {
    const byteOffset = getByteOffset(array, index);
    const view = new DataView(array.buffer);

    return view.getUint32(byteOffset, true);
}
