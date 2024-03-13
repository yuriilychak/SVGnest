import Int128 from "./int-128";

export default class IntPoint {
  private _data: Float64Array;

  constructor(x: number = 0, y: number = 0) {
    this._data = new Float64Array(2);
    this._data[0] = x;
    this._data[1] = y;
  }

  public set(point: IntPoint): IntPoint {
    this.X = point.X;
    this.Y = point.Y;

    return this;
  }

  public equal(point: IntPoint): boolean {
    return this.X === point.X && this.Y === point.Y;
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
    const a: number = point1.Y - point2.Y;
    const b: number = point2.X - point1.X;
    let c: number = a * point1.X + b * point1.Y;
    c = a * this.X + b * this.Y - c;

    return (c * c) / (a * a + b * b);
  }

  public get X(): number {
    return this._data[0];
  }

  public set X(value: number) {
    this._data[0] = value;
  }

  public get Y(): number {
    return this._data[1];
  }
  public set Y(value: number) {
    this._data[1] = value;
  }

  //return a == b;
  public static equal(a: IntPoint, b: IntPoint): boolean {
    return a.X == b.X && a.Y == b.Y;
  }

  //return a != b;
  public static unequal(a: IntPoint, b: IntPoint): boolean {
    return a.X != b.X || a.Y != b.Y;
  }

  public static from(point: IntPoint): IntPoint {
    return new IntPoint(point.X, point.Y);
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
        Int128.Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X),
        Int128.Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y)
      );
    else
      return (
        IntPoint.castInt64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) -
          IntPoint.castInt64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) ===
        0
      );
  }

  public static pointsAreClose(
    point1: IntPoint,
    point2: IntPoint,
    distSqrd: number
  ): boolean {
    const dx: number = point1.X - point2.X;
    const dy: number = point1.Y - point2.Y;

    return dx * dx + dy * dy <= distSqrd;
  }
}
