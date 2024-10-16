import { NFP_KEY_INDICES, TOL, UINT16_BIT_COUNT } from './constants';
import { NFPContent, PolygonNode } from './types';

export function getMask(bitCount: number, offset: number = 0): number {
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

function shiftNfpVaue(value: number, index: number): number {
    return value << NFP_KEY_INDICES[index];
}

function unshiftNfpVaue(value: number, index: number): number {
    return value >> NFP_KEY_INDICES[index];
}

export function toRotationIndex(angle: number, rotationSplit: number): number {
    return Math.round((angle * rotationSplit) / 360);
}

export function generateNFPCacheKey(rotationSplit: number, inside: boolean, polygon1: PolygonNode, polygon2: PolygonNode) {
    const rotationIndex1: number = toRotationIndex(polygon1.rotation, rotationSplit);
    const rotationIndex2: number = toRotationIndex(polygon2.rotation, rotationSplit);
    const data: number[] = [polygon1.source + 1, polygon2.source + 1, rotationIndex1, rotationIndex2, inside ? 1 : 0];
    const size: number = data.length;
    let result: number = 0;
    let i: number = 0;

    for (i = 0; i < size; ++i) {
        result += shiftNfpVaue(data[i], i);
    }

    return result;
}

export function keyToNFPData(numKey: number, rotationSplit: number): NFPContent {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const size: number = 5;
    const result: number[] = new Array(size);
    let accumulator: number = 0;
    let i: number = 0;

    for (i = size - 1; i >= 0; --i) {
        result[i] = unshiftNfpVaue(numKey - accumulator, i);
        accumulator += shiftNfpVaue(result[i], i);
    }

    return {
        A: result[0] - 1,
        B: result[1] - 1,
        inside: Boolean(result[4]),
        Arotation: result[2] * rotationOffset,
        Brotation: result[3] * rotationOffset
    };
}
