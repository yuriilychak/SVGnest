import { TOLEARANCE, almostEqual } from "./util";

export default class Point {
  public marked: boolean = false;
  private _data: Float64Array = new Float64Array(2);

  constructor(x: f64 = 0, y: f64 = 0) {
    this._data[0] = x;
    this._data[1] = y;
  }

  public scale(multiplier: f64): Point {
    this._data[0] *= multiplier;
    this._data[1] *= multiplier;

    return this;
  }

  public add(value: Point): Point {
    this._data[0] += value.x;
    this._data[1] += value.y;

    return this;
  }

  public sub(value: Point): Point {
    this._data[0] -= value.x;
    this._data[1] -= value.y;

    return this;
  }

  public set(value: Point): Point {
    this._data[0] = value.x;
    this._data[1] = value.y;

    return this;
  }

  public update(x: f64, y: f64): Point {
    this._data[0] = x;
    this._data[1] = y;

    return this;
  }

  public max(value: Point): Point {
    this._data[0] = Math.max(value.x, this._data[0]);
    this._data[1] = Math.max(value.y, this._data[1]);

    return this;
  }

  public min(value: Point): Point {
    this._data[0] = Math.min(value.x, this._data[0]);
    this._data[1] = Math.min(value.y, this._data[1]);

    return this;
  }

  public dot(value: Point): f64 {
    return value.x * this._data[0] + value.y * this._data[1];
  }

  public cross(value: Point, sign: f64 = 1): f64 {
    return this._data[1] * value.x + sign * this._data[0] * value.y;
  }

  public abs(): Point {
    this._data[0] = Math.abs(this._data[0]);
    this._data[1] = Math.abs(this._data[1]);

    return this;
  }

  public rotate(angle: f64): Point {
    const cos: f64 = Math.cos(angle);
    const sin: f64 = Math.sin(angle);
    const x: f64 = this._data[0];
    const y: f64 = this._data[1];

    this._data[0] = x * cos - y * sin;
    this._data[1] = x * sin + y * cos;

    return this;
  }

  public clone(): Point {
    return new Point(this._data[0], this._data[1]);
  }

  public almostEqual(point: Point, tolerance: f64 = TOLEARANCE): boolean {
    return Point.almostEqual(this, point, tolerance);
  }

  public normalize(distance: f64 = 1): Point {
    return this.scale(distance / this.length);
  }

  // returns true if p lies on the line segment defined by AB, but not at any endpoints
  // may need work!
  onSegment(a: Point, b: Point): bool {
    // vertical line
    if (almostEqual(a.x, b.x) && almostEqual(this.x, a.x)) {
      return (
        !almostEqual(this.y, b.y) &&
        !almostEqual(this.y, a.y) &&
        this.y < Math.max(b.y, a.y) &&
        this.y > Math.min(b.y, a.y)
      );
    }

    // horizontal line
    if (almostEqual(a.y, b.y) && almostEqual(this.y, a.y)) {
      return (
        !almostEqual(this.x, b.x) &&
        !almostEqual(this.x, a.x) &&
        this.x < Math.max(b.x, a.x) &&
        this.x > Math.min(b.x, a.x)
      );
    }

    //range check
    if (
      this.x < Math.min(a.x, b.x) ||
      this.x > Math.max(a.x, b.x) ||
      this.y < Math.min(a.y, b.y) ||
      this.y > Math.max(a.y, b.y) ||
      // exclude end points
      this.almostEqual(a) ||
      this.almostEqual(b)
    ) {
      return false;
    }

    const baDiff: Point = Point.sub(a, b);
    const paDiff: Point = Point.sub(a, this);
    const cross: f64 = paDiff.cross(baDiff, -1);

    if (Math.abs(cross) > TOLEARANCE) {
      return false;
    }

    const dot: f64 = paDiff.dot(baDiff);

    if (dot < 0 || almostEqual(dot, 0)) {
      return false;
    }

    const squareLength: f64 = baDiff.squareLength;

    if (dot > squareLength || almostEqual(dot, squareLength)) {
      return false;
    }

    return true;
  }

  public export(): Float64Array {
    return this._data.slice();
  }

  public get x(): f64 {
    return this._data[0];
  }

  public set x(value: f64) {
    this._data[0] = value;
  }

  public get y(): f64 {
    return this._data[1];
  }

  public set y(value: f64) {
    this._data[1] = value;
  }

  public get squareLength(): f64 {
    return this._data[0] * this._data[0] + this._data[1] * this._data[1];
  }

  public get length(): f64 {
    return Math.sqrt(this.squareLength);
  }

  public static from(point: Point): Point {
    return new Point(point.x, point.y);
  }

  public static abs(point: Point): Point {
    return new Point(Math.abs(point.x), Math.abs(point.y));
  }

  public static square(point: Point): Point {
    return new Point(point.x * point.x, point.y * point.y);
  }

  public static add(p1: Point, p2: Point): Point {
    return new Point(p1.x + p2.x, p1.y + p2.y);
  }

  public static sub(p1: Point, p2: Point): Point {
    return new Point(p2.x - p1.x, p2.y - p1.y);
  }

  public static almostEqual(
    point1: Point,
    point2: Point,
    tolerance: f64 = TOLEARANCE
  ): boolean {
    return (
      Math.abs(point1.x - point2.x) < tolerance &&
      Math.abs(point1.y - point2.y) < tolerance
    );
  }

  public static normal(value: Point): Point {
    return new Point(value.y, -value.x);
  }

  public static reverse(value: Point): Point {
    return new Point(-value.x, -value.y);
  }

  public static import(data: Float64Array): Point {
    return new Point(data[0], data[1]);
  }

  // normalize vector into a unit vector
  public static normalizeVector(value: Point): Point {
    const point = Point.from(value);

    // given vector was already a unit vector
    return almostEqual(point.squareLength, 1) ? point : point.normalize();
  }
}
