import { TOLERANCE, almostEqual } from "../util";

export default class Point {
  private _offset: u32 = 0;
  private _data: Float64Array = new Float64Array(2);

  constructor(data: Float64Array = new Float64Array(2), offset: u32 = 0) {
    this._data = data;
    this._offset = offset;
  }

  public scale(multiplier: f64): Point {
    this.x *= multiplier;
    this.y *= multiplier;

    return this;
  }

  public add(value: Point): Point {
    this.x += value.x;
    this.y += value.y;

    return this;
  }

  public sub(value: Point): Point {
    this.x -= value.x;
    this.y -= value.y;

    return this;
  }

  public set(value: Point): Point {
    this.x = value.x;
    this.y = value.y;

    return this;
  }

  public update(x: f64, y: f64): Point {
    this.x = x;
    this.y = y;

    return this;
  }

  public max(value: Point): Point {
    this.x = Math.max(value.x, this.x);
    this.y = Math.max(value.y, this.y);

    return this;
  }

  public min(value: Point): Point {
    this.x = Math.min(value.x, this.x);
    this.y = Math.min(value.y, this.y);

    return this;
  }

  public dot(value: Point): f64 {
    return value.x * this.x + value.y * this.y;
  }

  public cross(value: Point): f64 {
    return this.y * value.x - this.x * value.y;
  }

  public abs(): Point {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);

    return this;
  }

  public reverse(): Point {
    this.x = -this.x;
    this.y = -this.y;

    return this;
  }

  public rotate(angle: f64): Point {
    const cos: f64 = Math.cos(angle);
    const sin: f64 = Math.sin(angle);
    const x: f64 = this.x;
    const y: f64 = this.y;

    this.x = x * cos - y * sin;
    this.y = x * sin + y * cos;

    return this;
  }

  public clone(): Point {
    return new Point(this._data.slice(this._offset, this._offset + 2));
  }

  public almostEqual(point: Point, tolerance: f64 = TOLERANCE): boolean {
    return Point.almostEqual(this, point, tolerance);
  }

  public normalize(scale: f64 = 1): Point {
    return this.scale(scale / this.length);
  }

  public checkIntersect(point1: Point, point2: Point): boolean {
    return (
      Point._checkIntersect(this.x, point1.x, point2.x) &&
      Point._checkIntersect(this.y, point1.y, point2.y)
    );
  }

  // returns true if p lies on the line segment defined by AB, but not at any endpoints
  // may need work!
  public onSegment(a: Point, b: Point): boolean {
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

  public get x(): f64 {
    return this._data[this._offset];
  }

  public set x(value: f64) {
    this._data[this._offset] = value;
  }

  public get y(): f64 {
    return this._data[this._offset + 1];
  }

  public set y(value: f64) {
    this._data[this._offset + 1] = value;
  }

  public get squareLength(): f64 {
    return this.x * this.x + this.y * this.y;
  }

  public get length(): f64 {
    return Math.sqrt(this.squareLength);
  }

  public static min(point1: Point, point2: Point): Point {
    return Point.fromCords(
      Math.min(point1.x, point2.x),
      Math.min(point1.y, point2.y)
    );
  }

  public static max(point1: Point, point2: Point): Point {
    return Point.fromCords(
      Math.max(point1.x, point2.x),
      Math.max(point1.y, point2.y)
    );
  }

  public static from(point: Point): Point {
    return Point.fromCords(point.x, point.y);
  }

  public static abs(point: Point): Point {
    return Point.fromCords(Math.abs(point.x), Math.abs(point.y));
  }

  public static square(point: Point): Point {
    return Point.fromCords(point.x * point.x, point.y * point.y);
  }

  public static add(p1: Point, p2: Point): Point {
    return Point.fromCords(p1.x + p2.x, p1.y + p2.y);
  }

  public static sub(p1: Point, p2: Point): Point {
    return Point.fromCords(p2.x - p1.x, p2.y - p1.y);
  }

  public static almostEqual(
    point1: Point,
    point2: Point,
    tolerance: f64 = TOLERANCE
  ): boolean {
    return (
      Math.abs(point1.x - point2.x) < tolerance &&
      Math.abs(point1.y - point2.y) < tolerance
    );
  }

  public static normal(value: Point): Point {
    return Point.fromCords(value.y, -value.x);
  }

  public static reverse(value: Point): Point {
    return Point.fromCords(-value.x, -value.y);
  }

  // normalize vector into a unit vector
  public static normalize(point: Point): Point {
    const result = Point.from(point);

    // given vector was already a unit vector
    return almostEqual(result.squareLength, 1) ? result : result.normalize();
  }

  public static import(data: Float64Array): Point {
    return new Point(data);
  }

  public static export(point: Point): Float64Array {
    const result: Float64Array = new Float64Array(2);

    result[0] = point.x;
    result[1] = point.y;

    return result;
  }

  public static empty(): Point {
    return new Point();
  }

  public static fromCords(x: f64, y: f64): Point {
    const result = new Point();

    result.update(x, y);

    return result;
  }

  private static _checkIntersect(x: f64, a: f64, b: f64): boolean {
    return (
      (Number.isFinite(x) && almostEqual(a, b)) ||
      Math.abs(2 * x - a - b) <= Math.abs(a - b)
    );
  }
}
