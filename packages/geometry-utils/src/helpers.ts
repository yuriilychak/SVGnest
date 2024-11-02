import { NFP_KEY_INDICES, TOL, UINT16_BIT_COUNT } from './constants';
import { NestConfig, NFPCache, PolygonNode } from './types';

function getMask(bitCount: number, offset: number = 0): number {
    return ((1 << bitCount) - 1) << offset;
}

export function setBits(source: number, value: number, index: number, bitCount: number): number {
    const mask = getMask(bitCount, index);

    return (source & ~mask) | ((value << index) & mask);
}

export function getBits(source: number, index: number, numBits: number): number {
    return (source >>> index) & getMask(numBits);
}

export function getUint16(source: number, index: number): number {
    return getBits(source, index * UINT16_BIT_COUNT, UINT16_BIT_COUNT);
}

export function joinUint16(value1: number, value2: number): number {
    return value1 | (value2 << UINT16_BIT_COUNT);
}

export function almostEqual(a: number, b: number = 0, tolerance: number = TOL): boolean {
    return Math.abs(a - b) < tolerance;
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
        result = setBits(result, data[i], NFP_KEY_INDICES[i], NFP_KEY_INDICES[i + 1] - NFP_KEY_INDICES[i]);
    }

    return result;
}

export function getPolygonNode(source: number, memSeg: Float64Array): PolygonNode {
    return { source, rotation: 0, memSeg, children: [] };
}

function calculateTotalSize(nodes: PolygonNode[], initialSize: number): number {
    return nodes.reduce<number>((result: number, node: PolygonNode) => {
        const nodeSize = ((Float64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT) << 1) + node.memSeg.byteLength;
        const newResult = result + nodeSize;

        return calculateTotalSize(node.children, newResult);
    }, initialSize);
}

function serializeNodes(nodes: PolygonNode[], buffer: ArrayBuffer, view: DataView, offset: number): number {
    return nodes.reduce((result: number, node: PolygonNode) => {
        view.setFloat64(result, node.source + 1);
        result += Float64Array.BYTES_PER_ELEMENT;
        view.setFloat64(result, node.rotation);
        result += Float64Array.BYTES_PER_ELEMENT;

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
    result = setBits(result, config.curveTolerance * 10, 0, 4);
    result = setBits(result, config.spacing, 4, 5);
    result = setBits(result, config.rotations, 9, 5);
    result = setBits(result, config.populationSize, 14, 7);
    result = setBits(result, config.mutationRate, 21, 7);
    result = setBits(result, Number(config.useHoles), 28, 1);

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
