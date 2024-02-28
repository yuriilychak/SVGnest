import Point from "./point";

export default class Vector extends Point {
  private _start: Point;
  private _end: Point;

  constructor(point: Point, start: Point, end: Point) {
    super(point.x, point.y);

    this._start = start;
    this._end = end;
  }

  public get start(): Point {
    return this._start;
  }

  public set start(value: Point) {
    this._start = value;
  }

  public get end(): Point {
    return this._end;
  }

  public set end(value: Point) {
    this._end = value;
  }
}
