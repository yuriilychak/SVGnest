export default class IntPoint {
  public X: number = 0;
  public Y: number = 0;

  constructor(x: number = 0, y: number = 0) {
    this.X = x;
    this.Y = y;
  }

  //return a == b;
  public static equal(a: IntPoint, b: IntPoint): boolean {
    return a.X == b.X && a.Y == b.Y;
  }

  //return a != b;
  public static unequal(a: IntPoint, b: IntPoint): boolean {
    return a.X != b.X || a.Y != b.Y;
  }
}
