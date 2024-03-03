import { IPoint } from "./interfaces";
import { almostEqual } from "./util";

export default class FloatPoint implements IPoint {
  private _data: Float64Array = new Float64Array(2);

  constructor(x: number = 0, y: number = 0) {
    this._data[0] = x;
    this._data[1] = y;
  }

  public scale(multiplier: number): FloatPoint {
    this._data[0] *= multiplier;
    this._data[1] *= multiplier;

    return this;
  }

  public add(value: IPoint): FloatPoint {
    this._data[0] += value.x;
    this._data[1] += value.y;

    return this;
  }

  public sub(value: IPoint): FloatPoint {
    this._data[0] -= value.x;
    this._data[1] -= value.y;

    return this;
  }

  public set(value: IPoint): FloatPoint {
    this._data[0] = value.x;
    this._data[1] = value.y;

    return this;
  }

  public update(x: number, y: number): FloatPoint {
    this._data[0] = x;
    this._data[1] = y;

    return this;
  }

  public max(value: IPoint): FloatPoint {
    this._data[0] = Math.max(value.x, this._data[0]);
    this._data[1] = Math.max(value.y, this._data[1]);

    return this;
  }

  public min(value: IPoint): FloatPoint {
    this._data[0] = Math.min(value.x, this._data[0]);
    this._data[1] = Math.min(value.y, this._data[1]);

    return this;
  }

  public dot(value: IPoint): number {
    return value.x * this._data[0] + value.y * this._data[1];
  }

  public cross(value: IPoint, sign: number = 1): number {
    return this._data[1] * value.x + sign * this._data[0] * value.y;
  }

  public abs(): FloatPoint {
    this._data[0] = Math.abs(this._data[0]);
    this._data[1] = Math.abs(this._data[1]);

    return this;
  }

  public rotate(angle: number): FloatPoint {
    const cos: number = Math.cos(angle);
    const sin: number = Math.sin(angle);
    const x: number = this._data[0];
    const y: number = this._data[1];

    this._data[0] = x * cos - y * sin;
    this._data[1] = x * sin + y * cos;

    return this;
  }

  public clone(): FloatPoint {
    return new FloatPoint(this._data[0], this._data[1]);
  }

  public almostEqual(point: IPoint, tolerance?: number): boolean {
    return FloatPoint.almostEqual(this, point, tolerance);
  }

  public normalize(scale: number = 1): FloatPoint {
    return this.scale(scale / this.length);
  }

  // returns true if p lies on the line segment defined by AB, but not at any endpoints
  // may need work!
  public onSegment(a: IPoint, b: IPoint): boolean {
    const tolerance: number = Math.pow(10, -9);
    const max: FloatPoint = FloatPoint.from(a).max(b);
    const min: FloatPoint = FloatPoint.from(a).min(b);
    const offsetAB: FloatPoint = FloatPoint.sub(a, b);
    const offsetAP: FloatPoint = FloatPoint.sub(a, this);
    // vertical line
    if (Math.abs(offsetAB.x) < tolerance && Math.abs(offsetAP.x) < tolerance) {
      return (
        !almostEqual(this.y, b.y) &&
        !almostEqual(this.y, a.y) &&
        this.y < max.y &&
        this.y > min.y
      );
    }

    // horizontal line
    if (Math.abs(offsetAB.x) < tolerance && Math.abs(offsetAP.x) < tolerance) {
      return (
        !almostEqual(this.x, b.x) &&
        !almostEqual(this.x, a.x) &&
        this.x < max.x &&
        this.x > min.x
      );
    }

    //range check
    if (this.x < min.x || this.x > max.x || this.y < min.y || this.y > max.y) {
      return false;
    }

    // exclude end points
    if (
      FloatPoint.almostEqual(this, a) ||
      FloatPoint.almostEqual(this, b) ||
      Math.abs(offsetAP.cross(offsetAB, -1)) > tolerance
    ) {
      return false;
    }

    const dot: number = offsetAP.dot(offsetAB);
    const len2: number = offsetAB.squareLength;

    if (dot < tolerance || dot > len2 || almostEqual(dot, len2)) {
      return false;
    }

    return true;
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

  public get squareLength(): number {
    return this._data[0] * this._data[0] + this._data[1] * this._data[1];
  }

  public get length(): number {
    return Math.sqrt(this.squareLength);
  }

  public static from(point: IPoint): FloatPoint {
    return new FloatPoint(point.x, point.y);
  }

  public static abs(point: IPoint): FloatPoint {
    return new FloatPoint(Math.abs(point.x), Math.abs(point.y));
  }

  public static square(point: IPoint): FloatPoint {
    return new FloatPoint(point.x * point.x, point.y * point.y);
  }

  public static add(p1: IPoint, p2: IPoint): FloatPoint {
    return new FloatPoint(p1.x + p2.x, p1.y + p2.y);
  }

  public static sub(p1: IPoint, p2: IPoint): FloatPoint {
    return new FloatPoint(p2.x - p1.x, p2.y - p1.y);
  }

  public static almostEqual(
    point1: IPoint,
    point2: IPoint,
    tolerance: number = Math.pow(10, -9)
  ): boolean {
    return (
      Math.abs(point1.x - point2.x) < tolerance &&
      Math.abs(point1.y - point2.y) < tolerance
    );
  }

  public static normal(value: IPoint): FloatPoint {
    return new FloatPoint(value.y, -value.x);
  }

  public static reverse(value: IPoint): FloatPoint {
    return new FloatPoint(-value.x, -value.y);
  }

  // normalize vector into a unit vector
  public static normalizeVector(v: IPoint): FloatPoint {
    const point = FloatPoint.from(v);

    // given vector was already a unit vector
    return almostEqual(point.squareLength, 1)
      ? point
      : point.scale(1 / point.length);
  }

  public static export(point: IPoint): Float64Array {
    const result: Float64Array = new Float64Array(2);

    result[0] = point.x;
    result[1] = point.y;

    return result;
  }
}
