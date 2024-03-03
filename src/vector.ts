import { IPoint } from "./interfaces";
import Point from "./point";

export default class Vector extends Point {
  private _start: IPoint;
  private _end: IPoint;

  constructor(point: Point, start: IPoint, end: IPoint) {
    super(point.x, point.y);

    this._start = start;
    this._end = end;
  }

  public get start(): IPoint {
    return this._start;
  }

  public set start(value: IPoint) {
    this._start = value;
  }

  public get end(): IPoint {
    return this._end;
  }

  public set end(value: IPoint) {
    this._end = value;
  }
}
