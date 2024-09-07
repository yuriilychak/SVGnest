import { NFP_KEY_INDICES, TOL } from './constants';
import { IPolygon, NFPContent } from './types';

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

export function generateNFPCacheKey(
    rotationSplit: number,
    inside: boolean,
    polygon1: IPolygon,
    polygon2: IPolygon,
    rotation1: number = polygon1.rotation,
    rotation2: number = polygon2.rotation
) {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const rotationIndex1: number = Math.round(rotation1 / rotationOffset);
    const rotationIndex2: number = Math.round(rotation2 / rotationOffset);
    const data: number[] = [polygon1.id + 1, polygon2.id + 1, rotationIndex1, rotationIndex2, inside ? 1 : 0];
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
