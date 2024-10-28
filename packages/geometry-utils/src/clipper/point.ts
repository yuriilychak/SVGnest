import { IClipperPoint } from './types';

export default class Point implements IClipperPoint {
    private data: Float64Array;

    private constructor(x: number, y: number) {
        this.data = new Float64Array(2);
        this.data[0] = x;
        this.data[1] = y;
    }

    public get X(): number {
        return this.data[0];
    }

    public set X(value: number) {
        this.data[0] = value;
    }

    public get Y(): number {
        return this.data[1];
    }

    public set Y(value: number) {
        this.data[1] = value;
    }

    public static zero(): Point {
        return new Point(0, 0);
    }

    public static from(point: IClipperPoint) {
        return new Point(point.X, point.Y);
    }

    public static create(x: number, y: number) {
        return new Point(x, y);
    }
}
