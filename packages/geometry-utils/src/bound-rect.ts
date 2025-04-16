import { PointF64 } from './point';

export default class BoundRect {
    private _memSeg: Float64Array;

    private _position: PointF64;

    private _size: PointF64;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this._memSeg = new Float64Array([x, y, width, height]);
        this._position = new PointF64(this._memSeg, 0);
        this._size = new PointF64(this._memSeg, 2);
    }

    public clone(): BoundRect {
        return new BoundRect(this._position.x, this._position.y, this._size.x, this._size.y);
    }

    public update(position: PointF64, size: PointF64): void {
        this._position.update(position);
        this._size.update(size);
    }

    public get position(): PointF64 {
        return this._position;
    }

    public get size(): PointF64 {
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
}
