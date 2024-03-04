import { IPoint } from "./interfaces";
import { almostEqual } from "./util";

export default class Point implements IPoint {
  private _data: Float64Array = new Float64Array(2);

  constructor(x: number = 0, y: number = 0) {
    this._data[0] = x;
    this._data[1] = y;
  }

  public scale(multiplier: number): Point {
    this._data[0] *= multiplier;
    this._data[1] *= multiplier;

    return this;
  }

  public add(value: IPoint): Point {
    this._data[0] += value.x;
    this._data[1] += value.y;

    return this;
  }

  public sub(value: IPoint): Point {
    this._data[0] -= value.x;
    this._data[1] -= value.y;

    return this;
  }

  public set(value: IPoint): Point {
    this._data[0] = value.x;
    this._data[1] = value.y;

    return this;
  }

  public update(x: number, y: number): Point {
    this._data[0] = x;
    this._data[1] = y;

    return this;
  }

  public max(value: IPoint): Point {
    this._data[0] = Math.max(value.x, this._data[0]);
    this._data[1] = Math.max(value.y, this._data[1]);

    return this;
  }

  public min(value: IPoint): Point {
    this._data[0] = Math.min(value.x, this._data[0]);
    this._data[1] = Math.min(value.y, this._data[1]);

    return this;
  }

  public dot(value: IPoint): number {
    return value.x * this._data[0] + value.y * this._data[1];
  }

  public cross(value: IPoint): number {
    return this._data[1] * value.x - this._data[0] * value.y;
  }

  public abs(): Point {
    this._data[0] = Math.abs(this._data[0]);
    this._data[1] = Math.abs(this._data[1]);

    return this;
  }

  public reverse(): Point {
    this._data[0] = -this._data[0];
    this._data[1] = -this._data[1];

    return this;
  }

  public rotate(angle: number): Point {
    const cos: number = Math.cos(angle);
    const sin: number = Math.sin(angle);
    const x: number = this._data[0];
    const y: number = this._data[1];

    this._data[0] = x * cos - y * sin;
    this._data[1] = x * sin + y * cos;

    return this;
  }

  public clone(): Point {
    return new Point(this._data[0], this._data[1]);
  }

  public almostEqual(point: IPoint, tolerance?: number): boolean {
    return Point.almostEqual(this, point, tolerance);
  }

  public normalize(scale: number = 1): Point {
    return this.scale(scale / this.length);
  }

  public checkIntersect(point1: IPoint, point2: IPoint): boolean {
    return (
      Point._checkIntersect(this._data[0], point1.x, point2.x) &&
      Point._checkIntersect(this._data[1], point1.y, point2.y)
    );
  }

  // returns true if p lies on the line segment defined by AB, but not at any endpoints
  // may need work!
  public onSegment(a: IPoint, b: IPoint): boolean {
    const diffAB: Point = Point.sub(a, b);
    const diffAP: Point = Point.sub(a, this);
    const diffBP: Point = Point.sub(b, this);
    const minDiff: Point = Point.min(diffAP, diffBP);
    const maxDiff: Point = Point.max(diffAP, diffBP);
    // vertical line
    if (almostEqual(diffAB.x) && almostEqual(diffAP.x)) {
      return (
        !almostEqual(diffBP.y) &&
        !almostEqual(diffAP.y) &&
        minDiff.y < 0 &&
        maxDiff.y > 0
      );
    }

    // horizontal line
    if (almostEqual(diffAB.y) && almostEqual(diffAP.y)) {
      return (
        !almostEqual(diffBP.x) &&
        !almostEqual(diffAP.x) &&
        minDiff.x < 0 &&
        maxDiff.x > 0
      );
    }

    return (
      //range check
      maxDiff.x >= 0 &&
      minDiff.x <= 0 &&
      maxDiff.y >= 0 &&
      minDiff.y <= 0 &&
      // exclude end points
      !this.almostEqual(a) &&
      !this.almostEqual(b) &&
      almostEqual(diffAP.cross(diffAB)) &&
      !almostEqual(diffAP.dot(diffAB) - diffAB.squareLength)
    );
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

  public static min(point1: IPoint, point2: IPoint): Point {
    return new Point(
      Math.min(point1.x, point2.x),
      Math.min(point1.y, point2.y)
    );
  }

  public static max(point1: IPoint, point2: IPoint): Point {
    return new Point(
      Math.max(point1.x, point2.x),
      Math.max(point1.y, point2.y)
    );
  }

  public static from(point: IPoint): Point {
    return new Point(point.x, point.y);
  }

  public static abs(point: IPoint): Point {
    return new Point(Math.abs(point.x), Math.abs(point.y));
  }

  public static square(point: IPoint): Point {
    return new Point(point.x * point.x, point.y * point.y);
  }

  public static add(p1: IPoint, p2: IPoint): Point {
    return new Point(p1.x + p2.x, p1.y + p2.y);
  }

  public static sub(p1: IPoint, p2: IPoint): Point {
    return new Point(p2.x - p1.x, p2.y - p1.y);
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

  public static normal(value: IPoint): Point {
    return new Point(value.y, -value.x);
  }

  public static reverse(value: IPoint): Point {
    return new Point(-value.x, -value.y);
  }

  // normalize vector into a unit vector
  public static normalize(point: IPoint): Point {
    const result = Point.from(point);

    // given vector was already a unit vector
    return almostEqual(result.squareLength, 1) ? result : result.normalize();
  }

  public static import(data: Float64Array): Point {
    return new Point(data[0], data[1]);
  }

  public static export(point: IPoint): Float64Array {
    const result: Float64Array = new Float64Array(2);

    result[0] = point.x;
    result[1] = point.y;

    return result;
  }

  private static _checkIntersect(x: number, a: number, b: number): boolean {
    return (
      (Number.isFinite(x) && almostEqual(a, b)) ||
      Math.abs(2 * x - a - b) <= Math.abs(a - b)
    );
  }
}
