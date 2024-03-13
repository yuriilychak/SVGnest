export default class IntPoint {
  private _data: Float64Array;

  constructor(x: number = 0, y: number = 0) {
    this._data = new Float64Array(2);
    this._data[0] = x;
    this._data[1] = y;
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
}
