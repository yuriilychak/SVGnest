import Point from "./point";
import { IRect } from "./interfaces";

export default class Rect implements IRect {
  private _bottomLeft: Point = Point.empty();
  private _topRight: Point = Point.empty();
  private _size: Point = Point.empty();

  constructor(
    x: number = 0,
    y: number = 0,
    width: number = 0,
    height: number = 0
  ) {
    this._bottomLeft.update(x, y);
    this._topRight.update(x + width, y + height);
    this._size.update(width, height);
  }

  public get x(): number {
    return this._bottomLeft.x;
  }

  public set x(value: number) {
    this._bottomLeft.x = value;
    this._topRight.x = this._size.x + value;
  }

  public get y(): number {
    return this._bottomLeft.y;
  }

  public set y(value: number) {
    this._bottomLeft.y = value;
    this._topRight.y = this._size.y + value;
  }

  public get width(): number {
    return this._size.x;
  }

  public set width(value: number) {
    this._size.x = value;
    this._topRight.x = this._size.x + value;
  }

  public get height(): number {
    return this._size.y;
  }

  public set height(value: number) {
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
