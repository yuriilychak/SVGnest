import FloatPoint from "./float-point";
import { BoundRect } from "./interfaces";

export default class FloatRect implements BoundRect {
  private _bottomLeft: FloatPoint = new FloatPoint();
  private _topRight: FloatPoint = new FloatPoint();
  private _size: FloatPoint = new FloatPoint();

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

  public get bottomLeft(): FloatPoint {
    return this._bottomLeft.clone();
  }

  public get topRight(): FloatPoint {
    return this._topRight.clone();
  }

  public get size(): FloatPoint {
    return this._size.clone();
  }

  public static fromPoints(
    bottomLeft: FloatPoint,
    topRight: FloatPoint
  ): FloatRect {
    return new FloatRect(
      bottomLeft.x,
      bottomLeft.y,
      topRight.x - bottomLeft.x,
      topRight.y - bottomLeft.y
    );
  }
}
