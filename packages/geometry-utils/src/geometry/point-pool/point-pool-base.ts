import { PointF32 } from '../point';
import type { Point, PointPool, TypedArray } from '../../types';

export default class PointPoolBase<T extends TypedArray> implements PointPool<T> {
    private items: Point<T>[];

    private used: number;

    private memSeg: T;

    constructor(memSeg: T, items: Point<T>[]) {
        this.memSeg = memSeg;
        this.items = items;
        this.used = 0;
    }

    alloc(count: number): number {
        let result: number = 0;
        let currentCount: number = 0;
        let freeBits: number = ~this.used;
        let currentBit: number = 0;

        while (freeBits !== 0) {
            currentBit = 1 << (PointPoolBase.MAX_BITS - Math.clz32(freeBits));
            result |= currentBit;
            freeBits &= ~currentBit;
            ++currentCount;

            if (currentCount === count) {
                this.used |= result;
                return result;
            }
        }

        throw Error('Pool is empty');
    }

    malloc(indices: number): void {
        this.used &= ~indices;
    }

    get(indices: number, index: number): Point<T> {
        let currentIndex: number = 0;
        let bitIndex: number = 0;
        let currentBit: number = 0;
        let currentIndices: number = indices;

        while (currentIndices !== 0) {
            bitIndex = PointPoolBase.MAX_BITS - Math.clz32(currentIndices);
            currentBit = 1 << bitIndex;

            if (currentIndex === index) {
                return this.items[bitIndex];
            }

            currentIndices &= ~currentBit;
            ++currentIndex;
        }

        throw Error(`Can't find point with index ${index}`);
    }

    public get size(): number {
        return this.memSeg.byteLength;
    }

    private static readonly MAX_BITS: number = 31;

    public static readonly POOL_SIZE: number = 32;
}
