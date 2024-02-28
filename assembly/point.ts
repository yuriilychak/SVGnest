import { TOLEARANCE, almostEqual } from "./util";

export default class Point {
  public marked: boolean = false;
  private _data: Float32Array = new Float32Array(2);

  constructor(x: f32 = 0, y: f32 = 0) {
    this._data[0] = x;
    this._data[1] = y;
  }

  public scale(multiplier: f32): Point {
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

  public update(x: f32, y: f32): Point {
    this._data[0] = x;
    this._data[1] = y;

    return this;
  }

  public max(value: Point): Point {
    this._data[0] = f32(Math.max(value.x, this._data[0]));
    this._data[1] = f32(Math.max(value.y, this._data[1]));

    return this;
  }

  public min(value: Point): Point {
    this._data[0] = f32(Math.min(value.x, this._data[0]));
    this._data[1] = f32(Math.min(value.y, this._data[1]));

    return this;
  }

  public dot(value: Point): f32 {
    return value.x * this._data[0] + value.y * this._data[1];
  }

  public cross(value: Point, sign: f32 = 1): f32 {
    return this._data[1] * value.x + sign * this._data[0] * value.y;
  }

  public abs(): Point {
    this._data[0] = Math.abs(this._data[0]);
    this._data[1] = Math.abs(this._data[1]);

    return this;
  }

  public rotate(angle: f32): Point {
    const cos: f32 = Math.cos(angle);
    const sin: f32 = Math.sin(angle);
    const x: f32 = this._data[0];
    const y: f32 = this._data[1];

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

  // returns true if p lies on the line segment defined by AB, but not at any endpoints
  // may need work!
  public onSegment(a: Point, b: Point): boolean {
    const max: Point = Point.from(a).max(b);
    const min: Point = Point.from(a).min(b);
    const offsetAB: Point = Point.sub(a, b);
    const offsetAP: Point = Point.sub(a, this);
    // vertical line
    if (
      Math.abs(offsetAB.x) < TOLEARANCE &&
      Math.abs(offsetAP.x) < TOLEARANCE
    ) {
      return (
        !almostEqual(this.y, b.y) &&
        !almostEqual(this.y, a.y) &&
        this.y < max.y &&
        this.y > min.y
      );
    }

    // horizontal line
    if (
      Math.abs(offsetAB.x) < TOLEARANCE &&
      Math.abs(offsetAP.x) < TOLEARANCE
    ) {
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
      Point.almostEqual(this, a) ||
      Point.almostEqual(this, b) ||
      Math.abs(offsetAP.cross(offsetAB, -1)) > TOLEARANCE
    ) {
      return false;
    }

    const dot: f32 = offsetAP.dot(offsetAB);
    const len2: f32 = offsetAB.squareLength;

    if (dot < TOLEARANCE || dot > len2 || almostEqual(dot, len2)) {
      return false;
    }

    return true;
  }

  public export(): Float32Array {
    return this._data.slice();
  }

  public get x(): f32 {
    return this._data[0];
  }

  public set x(value: f32) {
    this._data[0] = value;
  }

  public get y(): f32 {
    return this._data[1];
  }

  public set y(value: f32) {
    this._data[1] = value;
  }

  public get squareLength(): f32 {
    return this._data[0] * this._data[0] + this._data[1] * this._data[1];
  }

  public get length(): f32 {
    return f32(Math.sqrt(this.squareLength));
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

  public static import(data: Float32Array): Point {
    return new Point(data[0], data[1]);
  }

  // normalize vector into a unit vector
  public static normalizeVector(v: Point): Point {
    const point = Point.from(v);

    // given vector was already a unit vector
    return almostEqual(point.squareLength, 1)
      ? point
      : point.scale(1 / point.length);
  }
}
