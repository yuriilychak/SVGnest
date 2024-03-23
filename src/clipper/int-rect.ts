import { Point } from "../geom";

export default class IntRect {
  private _data: Float64Array;

  constructor(
    left: number = 0,
    right: number = 0,
    top: number = 0,
    bottom: number = 0
  ) {
    this._data = new Float64Array(4);
    this._data[0] = left;
    this._data[1] = right;
    this._data[2] = top;
    this._data[3] = bottom;
  }

  public export(offset: number): Point[] {
    return [
      Point.fromCords(this.left - offset, this.bottom + offset),
      Point.fromCords(this.right + offset, this.bottom + offset),
      Point.fromCords(this.right + offset, this.top - offset),
      Point.fromCords(this.left - offset, this.top - offset)
    ];
  }

  public get left(): number {
    return this._data[0];
  }

  public set left(value: number) {
    this._data[0] = value;
  }

  public get right(): number {
    return this._data[1];
  }

  public set right(value: number) {
    this._data[1] = value;
  }

  public get top(): number {
    return this._data[2];
  }

  public set top(value: number) {
    this._data[2] = value;
  }

  public get bottom(): number {
    return this._data[3];
  }

  public set bottom(value: number) {
    this._data[3] = value;
  }

  public static fromPaths(paths: Point[][]): IntRect {
    let firstValidPath: number = 0;
    const pathCount: number = paths.length;

    while (firstValidPath < pathCount && paths[firstValidPath].length === 0) {
      ++firstValidPath;
    }

    if (firstValidPath == pathCount) {
      return new IntRect();
    }

    let path: Point[] = paths[firstValidPath];
    let point: Point = path[0];
    let i: number = 0;
    let j: number = 0;
    let pointCount: number = 0;
    const result: IntRect = new IntRect(point.x, point.x, point.y, point.y);

    for (i = firstValidPath; i < pathCount; ++i) {
      path = paths[i];
      pointCount = path.length;

      for (j = 0; j < pointCount; ++j) {
        point = path[j];
        result.left = Math.min(point.x, result.left);
        result.right = Math.max(point.x, result.right);
        result.top = Math.min(point.y, result.top);
        result.bottom = Math.max(point.y, result.bottom);
      }
    }
    return result;
  }
}
