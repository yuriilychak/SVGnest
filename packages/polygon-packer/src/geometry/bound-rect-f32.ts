import type { BoundRect } from '../types';

export default class BoundRectF32 implements BoundRect<Float32Array> {
    public x: number;

    public y: number;

    public width: number;

    public height: number;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    public from(rect: BoundRectF32): void {
        this.x = rect.x;
        this.y = rect.y;
        this.width = rect.width;
        this.height = rect.height;

    }

    public clean(): void {
        this.x = 0;
        this.y = 0;
        this.width = 0;
        this.height = 0
    }

    public clone(): BoundRectF32 {
        return new BoundRectF32(this.x, this.y, this.width, this.height);
    }
}
