import type { BoundRect, Point, TypedArray } from '../../types';

export default abstract class BoundRectBase<T extends TypedArray> implements BoundRect<T> {
    private _memSeg: T;

    private _position: Point<T>;

    private _size: Point<T>;

    constructor(memSeg: T, position: Point<T>, size: Point<T>) {
        this._memSeg = memSeg;
        this._position = position;
        this._size = size;
    }

    public abstract clone(): BoundRect<T>;

    public update(position: Point<T>, size: Point<T>): void {
        this._position.update(position);
        this._size.update(size);
    }

    public get position(): Point<T> {
        return this._position;
    }

    public get size(): Point<T> {
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
