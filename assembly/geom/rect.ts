import Point from "./point";

export default class Rect {
  private _bottomLeft: Point = new Point();
  private _topRight: Point = new Point();
  private _size: Point = new Point();

  constructor(x: f64 = 0, y: f64 = 0, width: f64 = 0, height: f64 = 0) {
    this._bottomLeft.update(x, y);
    this._topRight.update(x + width, y + height);
    this._size.update(width, height);
  }

  public get x(): f64 {
    return this._bottomLeft.x;
  }

  public set x(value: f64) {
    this._bottomLeft.x = value;
    this._topRight.x = this._size.x + value;
  }

  public get y(): f64 {
    return this._bottomLeft.y;
  }

  public set y(value: f64) {
    this._bottomLeft.y = value;
    this._topRight.y = this._size.y + value;
  }

  public get width(): f64 {
    return this._size.x;
  }

  public set width(value: f64) {
    this._size.x = value;
    this._topRight.x = this._size.x + value;
  }

  public get height(): f64 {
    return this._size.y;
  }

  public set height(value: f64) {
    this._size.y = value;
    this._topRight.y = this._bottomLeft.y + value;
  }

  public get bottomLeft(): Point {
    return this._bottomLeft.clone();
  }

  public get topRight(): Point {
    return this._topRight.clone();
  }

  public get size(): Point {
    return this._size.clone();
  }

  public static fromPoints(bottomLeft: Point, topRight: Point): Rect {
    return new Rect(
      bottomLeft.x,
      bottomLeft.y,
      topRight.x - bottomLeft.x,
      topRight.y - bottomLeft.y
    );
  }
}
