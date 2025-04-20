import { PointF64 } from './point';
import type { PointPool } from './types';
export default class PointPoolF64 implements PointPool<Float64Array> {
    private items: PointF64[];

    private used: number;

    private memSeg: Float64Array;

    constructor(buffer: ArrayBuffer, offset: number = 0) {
        this.items = new Array(PointPoolF64.POOL_SIZE);
        this.used = 0;
        this.memSeg = new Float64Array(buffer, offset, PointPoolF64.POOL_SIZE << 1);
        this.memSeg.fill(0);

        for (let i = 0; i < PointPoolF64.POOL_SIZE; ++i) {
            this.items[i] = new PointF64(this.memSeg, i << 1);
        }
    }

    alloc(count: number): number {
        let result: number = 0;
        let currentCount: number = 0;
        let freeBits: number = ~this.used;
        let currentBit: number = 0;

        while (freeBits !== 0) {
            currentBit = 1 << (PointPoolF64.MAX_BITS - Math.clz32(freeBits));
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

    get(indices: number, index: number): PointF64 {
        let currentIndex: number = 0;
        let bitIndex: number = 0;
        let currentBit: number = 0;
        let currentIndices: number = indices;

        while (currentIndices !== 0) {
            bitIndex = PointPoolF64.MAX_BITS - Math.clz32(currentIndices);
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

    public static POOL_SIZE: number = 32;
}
