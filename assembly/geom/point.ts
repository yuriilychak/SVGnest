import { TOLERANCE, almostEqual, clipperRound } from "../util";

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

  public skew(sin: f64, cos: f64): Point {
    const x: f64 = this.x;
    const y: f64 = this.y;

    this.x = x * cos - y * sin;
    this.y = x * sin + y * cos;

    return this;
  }

  public dot(value: Point): f64 {
    return value.x * this.x + value.y * this.y;
  }

  public cross(value: Point): f64 {
    return this.y * value.x - this.x * value.y;
  }

  public round(): Point {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);

    return this;
  }

  public abs(): Point {
    this.x = Math.abs(this.x);
    this.y = Math.abs(this.y);

    return this;
  }

  public rangeTest(isFullRange: boolean): boolean {
    const maxValue: f64 = Math.max(Math.abs(this.x), Math.abs(this.y));

    if (!isFullRange && maxValue > Point._lowRange) {
      return this.rangeTest(true);
    }

    if (isFullRange && maxValue > Point._highRange) {
      console.error("Coordinate outside allowed range in RangeTest().");
    }

    return isFullRange;
  }

  public reverse(): Point {
    this.x = -this.x;
    this.y = -this.y;

    return this;
  }

  public normal(): Point {
    const x: f64 = this.x;
    const y: f64 = this.y;

    this.x = y;
    this.y = -x;

    return this;
  }

  public equal(point: Point | null): boolean {
    return point !== null && this.x === point.x && this.y === point.y;
  }

  public clipperRound(): Point {
    this.x = clipperRound(this.x);
    this.y = clipperRound(this.y);

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

  public slopesNearCollinear(
    point1: Point,
    point2: Point,
    distSqrd: f64
  ): boolean {
    return this.distanceFromLineSqrd(point1, point2) < distSqrd;
  }

  public distanceFromLineSqrd(point1: Point, point2: Point): f64 {
    const a: f64 = point1.y - point2.y;
    const b: f64 = point2.x - point1.x;
    let c: f64 = a * point1.x + b * point1.y;
    c = a * this.x + b * this.y - c;

    return (c * c) / (a * a + b * b);
  }

  public between(point1: Point | null, point2: Point | null): boolean {
    if (point1 === null || point2 === null) {
      return false;
    }

    if (point1.equal(point2) || this.equal(point1) || this.equal(point2)) {
      return false;
    }

    if (point1.x != point2.x) {
      return this.x > point1.x == this.x < point2.x;
    }

    return this.y > point1.y == this.y < point2.y;
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

  public get isEmpty(): boolean {
    return this.x === 0 && this.y === 0;
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

  public static slopesEqual(
    pt1: Point | null,
    pt2: Point | null,
    pt3: Point | null = null
  ): boolean {
    if (pt1 === null || pt2 === null) {
      return false;
    }

    const offset1 = Point.from(pt1);
    const offset2 = Point.from(pt2);

    if (pt3 !== null) {
      offset1.sub(pt2);
      offset2.sub(pt3);
    }

    offset1.round();
    offset2.round();

    return (
      Math.sign(offset1.y) * Math.sign(offset2.x) ===
        Math.sign(offset1.x) * Math.sign(offset2.y) &&
      u64(Math.abs(offset1.y)) * u64(Math.abs(offset2.x)) ===
        u64(Math.abs(offset1.x)) * u64(Math.abs(offset2.y))
    );
  }

  public static deltaX(pt1: Point, pt2: Point): f64 {
    return pt1.y == pt2.y
      ? Number.MIN_SAFE_INTEGER
      : (pt2.x - pt1.x) / (pt2.y - pt1.y);
  }

  public static pointsAreClose(
    point1: Point,
    point2: Point,
    distSqrd: f64
  ): boolean {
    const point = Point.sub(point2, point1);

    return point.squareLength <= distSqrd;
  }

  private static _checkIntersect(x: f64, a: f64, b: f64): boolean {
    return (
      (Number.isFinite(x) && almostEqual(a, b)) ||
      Math.abs(2 * x - a - b) <= Math.abs(a - b)
    );
  }

  private static _lowRange: f64 = 47453132;
  private static _highRange: f64 = 4503599627370495;
}
