import { set_bits_u32, get_u16_from_u32, almost_equal } from 'wasm-nesting';
import { NFP_KEY_INDICES, TOL_F32, TOL_F64 } from './constants';
import { NestConfig, NFPCache, PolygonNode } from './types';

export function getUint16(source: number, index: number): number {
    return get_u16_from_u32(source, index);
}

export function almostEqual(a: number, b: number = 0, tolerance: number = TOL_F64): boolean {
    return almost_equal(a, b, tolerance);
}

export function almostEqualF32(a: number, b: number = 0, tolerance: number = TOL_F32): boolean {
    const diff = Math.fround(Math.abs(a - b));
    const scale = Math.fround(Math.max(Math.abs(a), Math.abs(b), 1));
    
    return diff <= tolerance * scale;
}


export function midValue(value: number, leftRange: number, rightRange: number): number {
    return Math.abs(2 * value - leftRange - rightRange) - Math.abs(leftRange - rightRange);
}

export function cycleIndex(index: number, size: number, offset: number): number {
    return (index + size + offset) % size;
}

export function toRotationIndex(angle: number, rotationSplit: number): number {
    return Math.round((angle * rotationSplit) / 360);
}

export function generateNFPCacheKey(
    rotationSplit: number,
    inside: boolean,
    polygon1: PolygonNode,
    polygon2: PolygonNode
): number {
    const rotationIndex1 = toRotationIndex(polygon1.rotation, rotationSplit);
    const rotationIndex2 = toRotationIndex(polygon2.rotation, rotationSplit);
    const data = new Uint8Array([polygon1.source + 1, polygon2.source + 1, rotationIndex1, rotationIndex2, inside ? 1 : 0]);
    const elementCount: number = data.length;
    let result: number = 0;
    let i: number = 0;

    for (i = 0; i < elementCount; ++i) {
        result = set_bits_u32(result, data[i], NFP_KEY_INDICES[i], NFP_KEY_INDICES[i + 1] - NFP_KEY_INDICES[i]);
    }

    return result;
}

export function getPolygonNode(source: number, memSeg: Float32Array): PolygonNode {
    return { source, rotation: 0, memSeg, children: [] };
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

export function clipperRound(a: number): number {
    return a < 0 ? -Math.round(Math.abs(a)) : Math.round(a);
}

export function castInt64(a: number): number {
    return a < 0 ? Math.ceil(a) : Math.floor(a);
}

function splitTo16Bits(value: number): Uint16Array {
    const mask: number = 0xffff;
    const splitSize: number = 4;
    const result = new Uint16Array(splitSize);
    let currentValue: number = Math.abs(value << 0);
    let i: number = 0;

    for (i = 0; i < splitSize; ++i) {
        result[i] = currentValue & mask;
        currentValue = currentValue >>> 16;
    }

    return result;
}

function mulInt128(x: number, y: number): Uint32Array {
    const xParts: Uint16Array = splitTo16Bits(x);
    const yParts: Uint16Array = splitTo16Bits(y);
    const result = new Uint32Array(5);
    const mask: number = 0xffffffff;
    let i: number = 0;

    result[0] = 0;
    result[1] = (xParts[0] * yParts[0]) & mask;
    result[2] = (xParts[1] * yParts[0] + xParts[0] * yParts[1]) & mask;
    result[3] = (xParts[2] * yParts[0] + xParts[0] * yParts[2] + xParts[1] * yParts[1]) & mask;
    result[4] = (xParts[3] * yParts[3] + xParts[3] * yParts[0] + xParts[2] * yParts[1]) & mask;

    for (i = 4; i > 0; --i) {
        result[i] += result[i - 1] >>> 16;
    }

    result[0] = 1 + Math.sign(x) * Math.sign(y);

    return result;
}

function equalityInt128(left: Uint32Array, right: Uint32Array): boolean {
    const iterationCount: number = left.length;
    let i: number = 0;

    for (i = 0; i < iterationCount; ++i) {
        if (left[i] !== right[i]) {
            return false;
        }
    }

    return true;
}

export function slopesEqual(value1: number, value2: number, value3: number, value4: number, useFullRange: boolean): boolean {
    return useFullRange
        ? equalityInt128(mulInt128(value1, value2), mulInt128(value3, value4))
        : castInt64(value1 * value2) - castInt64(value3 * value4) === 0;
}

function getByteOffset(array: Float32Array, index: number): number {
    return (array.byteOffset >>> 0) + index * Float32Array.BYTES_PER_ELEMENT;
}

export function readUint32FromF32(array: Float32Array, index: number): number {
    const byteOffset = getByteOffset(array, index); 
    const view = new DataView(array.buffer);

    return view.getUint32(byteOffset, true); 
}

export function writeUint32ToF32(array: Float32Array, index: number, value: number): void {
    const byteOffset = getByteOffset(array, index); 
    const view = new DataView(array.buffer);

    view.setUint32(byteOffset, value >>> 0, true); 
}
