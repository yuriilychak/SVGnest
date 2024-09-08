import Point from './point';

export default class PointPool {
    private items: Point[];

    private usedItems: number;

    private stack: Float64Array;

    private size: number;

    constructor(pointCount: number = PointPool.MAX_POOL_SIZE) {
        if (pointCount > PointPool.MAX_POOL_SIZE) {
            console.warn(`Max pool size is ${PointPool.MAX_POOL_SIZE}`);
        }

        let i: number = 0;

        this.size = Math.min(pointCount, PointPool.MAX_POOL_SIZE);
        this.items = new Array(this.size);
        this.usedItems = 0;
        this.stack = new Float64Array(this.size << 1);

        this.stack.fill(0);

        for (i = 0; i < pointCount; ++i) {
            this.items[i] = new Point(this.stack, i << 1);
        }
    }

    alloc(count: number): number {
        let i: number = 0;
        let result: number = 0;
        let currentBit: number = 0;
        let currentCount: number = 0;

        for (i = 0; i < this.size; ++i) {
            currentBit = 1 << i;

            if ((currentBit & this.usedItems) === 0) {
                result |= currentBit;
                ++currentCount;

                if (currentCount === count) {
                    this.usedItems |= result;

                    return result;
                }
            }
        }

        throw Error('Pull is empty');
    }

    malloc(indices: number): void {
        this.usedItems &= ~indices;
    }

    get(indices: number, index: number): Point {
        let i: number = 0;
        let currentIndex: number = 0;

        for (i = 0; i < this.size; ++i) {
            if ((indices & (1 << i)) === 0) {
                continue;
            }

            if (currentIndex === index) {
                return this.items[i];
            }

            ++currentIndex;
        }

        throw Error(`Can't find point with ${index}`);
    }

    private static MAX_POOL_SIZE: number = 53;
}
