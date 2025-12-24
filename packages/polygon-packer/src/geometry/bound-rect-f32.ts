import type { BoundRect, Point } from '../types';
import PointF32 from './point-f32';

export default class BoundRectF32 implements BoundRect<Float32Array> {
    private _memSeg: Float32Array;

    private _position: Point<Float32Array>;

    private _size: Point<Float32Array>;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this._memSeg = new Float32Array([x, y, width, height]);
        this._position = new PointF32(this._memSeg, 0);
        this._size = new PointF32(this._memSeg, 2);
    }

    public update(position: Point<Float32Array>, size: Point<Float32Array>): void {
        this._position.update(position);
        this._size.update(size);
    }

    public get position(): Point<Float32Array> {
        return this._position;
    }

    public get size(): Point<Float32Array> {
        return this._size;
    }

    public get x(): number {
        return this._position.x;
    }

    public get y(): number {
        return this._position.y;
    }

    public get width(): number {
        return this._size.x;
    }

    public get height(): number {
        return this._size.y;
    }

    public clean(): void {
        this._memSeg.fill(0);
    }

    public clone(): BoundRectF32 {
        return new BoundRectF32(this.x, this.y, this.width, this.height);
    }
}
