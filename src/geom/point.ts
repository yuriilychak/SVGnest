import { IPoint } from "../interfaces";
import { almostEqual } from "../util";

export default class Point implements IPoint {
  private _offset: number = 0;
  private _data: Float64Array = new Float64Array(2);

  constructor(data: Float64Array = new Float64Array(2), offset: number = 0) {
    this._data = data;
    this._offset = offset;
  }

  public scale(multiplier: number): Point {
    this.x *= multiplier;
    this.y *= multiplier;

    return this;
  }

  public add(value: IPoint): Point {
    this.x += value.x;
    this.y += value.y;

    return this;
  }

  public sub(value: IPoint): Point {
    this.x -= value.x;
    this.y -= value.y;

    return this;
  }

  public set(value: IPoint): Point {
    this.x = value.x;
    this.y = value.y;

    return this;
  }

  public update(x: number, y: number): Point {
    this.x = x;
    this.y = y;

    return this;
  }

  public max(value: IPoint): Point {
    this.x = Math.max(value.x, this.x);
    this.y = Math.max(value.y, this.y);

    return this;
  }

  public min(value: IPoint): Point {
    this.x = Math.min(value.x, this.x);
    this.y = Math.min(value.y, this.y);

    return this;
  }

  public dot(value: IPoint): number {
    return value.x * this.x + value.y * this.y;
  }

  public cross(value: IPoint): number {
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

  public rotate(angle: number): Point {
    const cos: number = Math.cos(angle);
    const sin: number = Math.sin(angle);
    const x: number = this.x;
    const y: number = this.y;

    this.x = x * cos - y * sin;
    this.y = x * sin + y * cos;

    return this;
  }

  public clone(): Point {
    return new Point(this._data.slice(this._offset, this._offset + 2));
  }

  public almostEqual(point: IPoint, tolerance?: number): boolean {
    return Point.almostEqual(this, point, tolerance);
  }

  public normalize(scale: number = 1): Point {
    return this.scale(scale / this.length);
  }

  public checkIntersect(point1: IPoint, point2: IPoint): boolean {
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

  public round(): Point {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);

    return this;
  }

  public equal(point: Point): boolean {
    return this.x === point.x && this.y === point.y;
  }

  public slopesNearCollinear(
    point1: Point,
    point2: Point,
    distSqrd: number
  ): boolean {
    return this.distanceFromLineSqrd(point1, point2) < distSqrd;
  }

  public distanceFromLineSqrd(point1: Point, point2: Point): number {
    const a: number = point1.y - point2.y;
    const b: number = point2.x - point1.x;
    let c: number = a * point1.x + b * point1.y;
    c = a * this.x + b * this.y - c;

    return (c * c) / (a * a + b * b);
  }

  public between(point1: Point, point2: Point): boolean {
    if (point1.equal(point2) || this.equal(point1) || this.equal(point2)) {
      return false;
    } else if (point1.x != point2.x) {
      return this.x > point1.x == this.x < point2.x;
    } else {
      return this.y > point1.y == this.y < point2.y;
    }
  }

  public rangeTest(isFullRange: boolean): boolean {
    const maxValue: number = Math.max(Math.abs(this.x), Math.abs(this.y));

    if (!isFullRange && maxValue > Point._lowRange) {
      return this.rangeTest(true);
    }

    if (isFullRange && maxValue > Point._highRange) {
      console.error("Coordinate outside allowed range in RangeTest().");
    }

    return isFullRange;
  }

  public get x(): number {
    return this._data[this._offset];
  }

  public set x(value) {
    this._data[this._offset] = value;
  }

  public get y(): number {
    return this._data[this._offset + 1];
  }

  public set y(value) {
    this._data[this._offset + 1] = value;
  }

  public get squareLength(): number {
    return this.x * this.x + this.y * this.y;
  }

  public get length(): number {
    return Math.sqrt(this.squareLength);
  }

  public get isEmpty(): boolean {
    return this.x === 0 && this.y === 0;
  }

  public static slopesEqual(
    pt1: Point,
    pt2: Point,
    pt3: Point = null
  ): boolean {
    const offset1 = Point.from(pt1);
    const offset2 = Point.from(pt2);

    if (pt3 !== null) {
      offset1.sub(pt2);
      offset2.sub(pt3);
    }

    offset1.round();
    offset2.round();

    if (
      Math.sign(offset1.y) * Math.sign(offset2.x) !==
      Math.sign(offset1.x) * Math.sign(offset2.y)
    ) {
      return false;
    }

    const array = new BigUint64Array(2);
    array[0] = BigInt(Math.abs(offset1.y)) * BigInt(Math.abs(offset2.x));
    array[1] = BigInt(Math.abs(offset1.x)) * BigInt(Math.abs(offset2.y));

    return array[0] === array[1];
  }

  public static pointsAreClose(
    point1: Point,
    point2: Point,
    distSqrd: number
  ): boolean {
    const point = Point.sub(point2, point1);

    return point.squareLength <= distSqrd;
  }

  public static deltaX(pt1: Point, pt2: Point): number {
    return pt1.y == pt2.y
      ? Number.MIN_SAFE_INTEGER
      : (pt2.x - pt1.x) / (pt2.y - pt1.y);
  }

  public static min(point1: IPoint, point2: IPoint): Point {
    return Point.fromCords(
      Math.min(point1.x, point2.x),
      Math.min(point1.y, point2.y)
    );
  }

  public static max(point1: IPoint, point2: IPoint): Point {
    return Point.fromCords(
      Math.max(point1.x, point2.x),
      Math.max(point1.y, point2.y)
    );
  }

  public static from(point: IPoint): Point {
    return Point.fromCords(point.x, point.y);
  }

  public static abs(point: IPoint): Point {
    return Point.fromCords(Math.abs(point.x), Math.abs(point.y));
  }

  public static square(point: IPoint): Point {
    return Point.fromCords(point.x * point.x, point.y * point.y);
  }

  public static add(p1: IPoint, p2: IPoint): Point {
    return Point.fromCords(p1.x + p2.x, p1.y + p2.y);
  }

  public static sub(p1: IPoint, p2: IPoint): Point {
    return Point.fromCords(p2.x - p1.x, p2.y - p1.y);
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
    return Point.fromCords(value.y, -value.x);
  }

  public static reverse(value: IPoint): Point {
    return Point.fromCords(-value.x, -value.y);
  }

  // normalize vector into a unit vector
  public static normalize(point: IPoint): Point {
    const result = Point.from(point);

    // given vector was already a unit vector
    return almostEqual(result.squareLength, 1) ? result : result.normalize();
  }

  public static import(data: Float64Array): Point {
    return new Point(data);
  }

  public static export(point: IPoint): Float64Array {
    const result: Float64Array = new Float64Array(2);

    result[0] = point.x;
    result[1] = point.y;

    return result;
  }

  public static empty(): Point {
    return new Point();
  }

  public static fromCords(x: number, y: number): Point {
    const result = new Point();

    result.update(x, y);

    return result;
  }

  private static _checkIntersect(x: number, a: number, b: number): boolean {
    return (
      (Number.isFinite(x) && almostEqual(a, b)) ||
      Math.abs(2 * x - a - b) <= Math.abs(a - b)
    );
  }

  private static _lowRange: number = 47453132; // sqrt(2^53 -1)/2
  private static _highRange: number = 4503599627370495; // sqrt(2^106 -1)/2
}
