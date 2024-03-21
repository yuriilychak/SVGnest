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

  public round(): IntPoint {
    this.x = Math.round(this.x);
    this.y = Math.round(this.y);

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
    return IntPoint.fromCords(point.x, point.y);
  }

  public static sub(point1: IntPoint, point2: IntPoint): IntPoint {
    return IntPoint.from(point2).sub(point1);
  }

  public static empty(): IntPoint {
    return new IntPoint();
  }

  public static fromCords(x: number, y: number): IntPoint {
    return IntPoint.empty().update(x, y);
  }

  public static slopesEqual(
    pt1: IntPoint,
    pt2: IntPoint,
    pt3: IntPoint = null
  ): boolean {
    const offset1 = IntPoint.from(pt1);
    const offset2 = IntPoint.from(pt2);

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
    point1: IntPoint,
    point2: IntPoint,
    distSqrd: number
  ): boolean {
    const dx: number = point1.x - point2.x;
    const dy: number = point1.y - point2.y;

    return dx * dx + dy * dy <= distSqrd;
  }

  public static deltaX(pt1: IntPoint, pt2: IntPoint): number {
    if (pt1.y == pt2.y) return Number.MIN_SAFE_INTEGER;
    else return (pt2.x - pt1.x) / (pt2.y - pt1.y);
  }

  private static _lowRange: number = 47453132; // sqrt(2^53 -1)/2
  private static _highRange: number = 4503599627370495; // sqrt(2^106 -1)/2
}
