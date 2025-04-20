import { PointF32 } from './point';

export default class PointPoolF32 {
    private items: PointF32[];

    private used: number;

    private memSeg: Float32Array;

    constructor(buffer: ArrayBuffer, offset: number = 0) {
        this.items = new Array(PointPoolF32.POOL_SIZE);
        this.used = 0;
        this.memSeg = new Float32Array(buffer, offset, PointPoolF32.POOL_SIZE << 1);
        this.memSeg.fill(0);

        for (let i = 0; i < PointPoolF32.POOL_SIZE; ++i) {
            this.items[i] = new PointF32(this.memSeg, i << 1);
        }
    }

    alloc(count: number): number {
        let result: number = 0;
        let currentCount: number = 0;
        let freeBits: number = ~this.used;
        let currentBit: number = 0;

        while (freeBits !== 0) {
            currentBit = 1 << (PointPoolF32.MAX_BITS - Math.clz32(freeBits));
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

    get(indices: number, index: number): PointF32 {
        let currentIndex: number = 0;
        let bitIndex: number = 0;
        let currentBit: number = 0;
        let currentIndices: number = indices;

        while (currentIndices !== 0) {
            bitIndex = PointPoolF32.MAX_BITS - Math.clz32(currentIndices);
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
