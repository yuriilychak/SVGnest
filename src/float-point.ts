import { Point } from "./interfaces";

export default class FloatPoint implements Point {
  private _data: Float32Array = new Float32Array(2);

  constructor(x: number = 0, y: number = 0) {
    this._data[0] = x;
    this._data[1] = y;
  }

  public scale(multiplier: number): FloatPoint {
    this._data[0] *= multiplier;
    this._data[1] *= multiplier;

    return this;
  }

  public abs(): void {
    this._data[0] = Math.abs(this._data[0]);
    this._data[1] = Math.abs(this._data[1]);
  }

  public clone(): FloatPoint {
    return new FloatPoint(this._data[0], this._data[1]);
  }

  public get x(): number {
    return this._data[0];
  }

  public set x(value) {
    this._data[0] = value;
  }

  public get y(): number {
    return this._data[1];
  }

  public set y(value) {
    this._data[1] = value;
  }

  public get squareDistance(): number {
    return this._data[0] * this._data[0] + this._data[1] + this._data[1];
  }

  public static from(point: Point): FloatPoint {
    return new FloatPoint(point.x, point.y);
  }

  public static abs(point: Point): FloatPoint {
    return new FloatPoint(Math.abs(point.x), Math.abs(point.y));
  }

  public static square(point: Point): FloatPoint {
    return new FloatPoint(point.x * point.x, point.y * point.y);
  }

  public static add(p1: Point, p2: Point): FloatPoint {
    return new FloatPoint(p1.x + p2.x, p1.y + p2.y);
  }

  public static sub(p1: Point, p2: Point): FloatPoint {
    return new FloatPoint(p2.x - p1.x, p2.y - p1.y);
  }
}
