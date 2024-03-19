import Int128 from "./int-128";

export default class IntPoint {
  private _data: Float64Array;

  constructor(x: number = 0, y: number = 0) {
    this._data = new Float64Array(2);
    this._data[0] = x;
    this._data[1] = y;
  }

  public set(point: IntPoint): IntPoint {
    this.x = point.x;
    this.y = point.y;

    return this;
  }

  public sub(point: IntPoint): IntPoint {
    this.x -= point.x;
    this.y -= point.y;

    return this;
  }

  public update(x: number, y: number): IntPoint {
    this.x = x;
    this.y = y;

    return this;
  }

  public equal(point: IntPoint): boolean {
    return this.x === point.x && this.y === point.y;
  }

  public cross(point: IntPoint): number {
    return this.y * point.x - this.x * point.y;
  }

  public slopesNearCollinear(
    point1: IntPoint,
    point2: IntPoint,
    distSqrd: number
  ): boolean {
    return this.distanceFromLineSqrd(point1, point2) < distSqrd;
  }

  //The equation of a line in general form (Ax + By + C = 0)
  //given 2 points (x�,y�) & (x�,y�) is ...
  //(y� - y�)x + (x� - x�)y + (y� - y�)x� - (x� - x�)y� = 0
  //A = (y� - y�); B = (x� - x�); C = (y� - y�)x� - (x� - x�)y�
  //perpendicular distance of point (x�,y�) = (Ax� + By� + C)/Sqrt(A� + B�)
  //see http://en.wikipedia.org/wiki/Perpendicular_distance
  public distanceFromLineSqrd(point1: IntPoint, point2: IntPoint): number {
    const a: number = point1.y - point2.y;
    const b: number = point2.x - point1.x;
    let c: number = a * point1.x + b * point1.y;
    c = a * this.x + b * this.y - c;

    return (c * c) / (a * a + b * b);
  }

  public between(point1: IntPoint, point2: IntPoint): boolean {
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

    if (!isFullRange && maxValue > IntPoint._lowRange) {
      return this.rangeTest(true);
    }

    if (isFullRange && maxValue > IntPoint._highRange) {
      console.error("Coordinate outside allowed range in RangeTest().");
    }

    return isFullRange;
  }

  public get x(): number {
    return this._data[0];
  }

  public set x(value: number) {
    this._data[0] = value;
  }

  public get y(): number {
    return this._data[1];
  }
  public set y(value: number) {
    this._data[1] = value;
  }

  public get isEmpty(): boolean {
    return this.x === 0 && this.y === 0;
  }

  //return a == b;
  public static equal(a: IntPoint, b: IntPoint): boolean {
    return a.x == b.x && a.y == b.y;
  }

  //return a != b;
  public static unequal(a: IntPoint, b: IntPoint): boolean {
    return a.x != b.x || a.y != b.y;
  }

  public static from(point: IntPoint): IntPoint {
    return new IntPoint(point.x, point.y);
  }

  public static sub(point1: IntPoint, point2: IntPoint): IntPoint {
    return IntPoint.from(point2).sub(point1);
  }

  public static castInt64(a: number): number {
    if (a < -2147483648 || a > 2147483647)
      return a < 0 ? Math.ceil(a) : Math.floor(a);
    else return ~~a;
  }

  public static slopesEqual(
    pt1: IntPoint,
    pt2: IntPoint,
    pt3: IntPoint,
    isFullRange: boolean = false
  ): boolean {
    // function (pt1, pt2, pt3, UseFullRange)
    if (isFullRange)
      return Int128.op_Equality(
        Int128.Int128Mul(pt1.y - pt2.y, pt2.x - pt3.x),
        Int128.Int128Mul(pt1.x - pt2.x, pt2.y - pt3.y)
      );
    else
      return (
        IntPoint.castInt64((pt1.y - pt2.y) * (pt2.x - pt3.x)) -
          IntPoint.castInt64((pt1.x - pt2.x) * (pt2.y - pt3.y)) ===
        0
      );
  }

  public static pointsAreClose(
    point1: IntPoint,
    point2: IntPoint,
    distSqrd: number
  ): boolean {
    const dx: number = point1.x - point2.x;
    const dy: number = point1.y - point2.y;

    return dx * dx + dy * dy <= distSqrd;
  }

  public static deltaX(pt1: IntPoint, pt2: IntPoint) {
    if (pt1.y == pt2.y) return Number.MIN_SAFE_INTEGER;
    else return (pt2.x - pt1.x) / (pt2.y - pt1.y);
  }

  private static _lowRange: number = 47453132; // sqrt(2^53 -1)/2
  private static _highRange: number = 4503599627370495; // sqrt(2^106 -1)/2
}
