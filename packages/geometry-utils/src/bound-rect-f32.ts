import PointF32 from './point-f32';

export default class BoundRectF32 {
    private _memSeg: Float32Array;

    private _position: PointF32;

    private _size: PointF32;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this._memSeg = new Float32Array([x, y, width, height]);
        this._position = new PointF32(this._memSeg, 0);
        this._size = new PointF32(this._memSeg, 2);
    }

    public clone(): BoundRectF32 {
        return new BoundRectF32(this._position.x, this._position.y, this._size.x, this._size.y);
    }

    public update(position: PointF32, size: PointF32): void {
        this._position.update(position);
        this._size.update(size);
    }

    public get position(): PointF32 {
        return this._position;
    }

    public get size(): PointF32 {
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
