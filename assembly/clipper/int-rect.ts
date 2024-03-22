import { Point } from "../geom";

export default class IntRect {
  private _data: Float64Array;

  constructor(left: f64 = 0, right: f64 = 0, top: f64 = 0, bottom: f64 = 0) {
    this._data = new Float64Array(4);
    this._data[0] = left;
    this._data[1] = right;
    this._data[2] = top;
    this._data[3] = bottom;
  }

  public export(offset: f64): Point[] {
    return [
      Point.fromCords(this.left - offset, this.bottom + offset),
      Point.fromCords(this.right + offset, this.bottom + offset),
      Point.fromCords(this.right + offset, this.top - offset),
      Point.fromCords(this.left - offset, this.top - offset)
    ];
  }

  public get left(): f64 {
    return this._data[0];
  }

  public set left(value: f64) {
    this._data[0] = value;
  }

  public get right(): f64 {
    return this._data[1];
  }

  public set right(value: f64) {
    this._data[1] = value;
  }

  public get top(): f64 {
    return this._data[2];
  }

  public set top(value: f64) {
    this._data[2] = value;
  }

  public get bottom(): f64 {
    return this._data[3];
  }

  public set bottom(value: f64) {
    this._data[3] = value;
  }

  public static fromPaths(paths: Point[][]): IntRect {
    let firstValidPath: u16 = 0;
    const pathCount: u16 = u16(paths.length);

    while (
      firstValidPath < pathCount &&
      paths.at(firstValidPath).length === 0
    ) {
      ++firstValidPath;
    }

    if (firstValidPath == pathCount) {
      return new IntRect();
    }

    let path: Point[] = paths[firstValidPath];
    let point: Point = path.at(0);
    let i: u16 = 0;
    let j: u16 = 0;
    let pointCount: u16 = 0;
    const result: IntRect = new IntRect(point.x, point.x, point.y, point.y);

    for (i = firstValidPath; i < pathCount; ++i) {
      path = paths.at(i);
      pointCount = path.length;

      for (j = 0; j < pointCount; ++j) {
        point = path.at(j);
        result.left = Math.min(point.x, result.left);
        result.right = Math.max(point.x, result.right);
        result.top = Math.min(point.y, result.top);
        result.bottom = Math.max(point.y, result.bottom);
      }
    }
    return result;
  }
}
