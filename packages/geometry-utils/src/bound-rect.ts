import Point from './point';

export default class BoundRect {
    private _memSeg: Float64Array;

    private _position: Point;

    private _size: Point;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this._memSeg = new Float64Array([x, y, width, height]);
        this._position = new Point(this._memSeg, 0);
        this._size = new Point(this._memSeg, 2);
    }

    public clone(): BoundRect {
        return new BoundRect(this._position.x, this._position.y, this._size.x, this._size.y);
    }

    public update(position: Point, size: Point): void {
        this._position.update(position);
        this._size.update(size);
    }

    public get position(): Point {
        return this._position;
    }

    public get size(): Point {
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
