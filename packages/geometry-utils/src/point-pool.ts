import Point from './point';

export default class PointPool {
    private items: Point[];

    private used: number;

    private memSeg: Float64Array;

    constructor(buffer: ArrayBuffer) {
        this.items = new Array(PointPool.POOL_SIZE);
        this.used = 0;
        this.memSeg = new Float64Array(buffer, 0, PointPool.POOL_SIZE << 1);
        this.memSeg.fill(0);

        for (let i = 0; i < PointPool.POOL_SIZE; ++i) {
            this.items[i] = new Point(this.memSeg, i << 1);
        }
    }

    alloc(count: number): number {
        let result: number = 0;
        let currentCount: number = 0;
        let freeBits: number = ~this.used;
        let currentBit: number = 0;

        while (freeBits !== 0) {
            currentBit = 1 << (PointPool.MAX_BITS - Math.clz32(freeBits));
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

    get(indices: number, index: number): Point {
        let currentIndex: number = 0;
        let bitIndex: number = 0;
        let currentBit: number = 0;
        let currentIndices: number = indices;

        while (currentIndices !== 0) {
            bitIndex = PointPool.MAX_BITS - Math.clz32(currentIndices);
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
