import IntPoint from "./int-point";

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

  public static fromPaths(paths: IntPoint[][]): IntRect {
    let firstValidPath: number = 0;
    const pathCount: number = paths.length;

    while (
      firstValidPath < pathCount &&
      paths.at(firstValidPath).length === 0
    ) {
      ++firstValidPath;
    }

    if (firstValidPath == pathCount) {
      return new IntRect();
    }

    let path: IntPoint[] = paths[firstValidPath];
    let point: IntPoint = path.at(0);
    let i: number = 0;
    let j: number = 0;
    let pointCount: number = 0;
    const result: IntRect = new IntRect(point.X, point.X, point.Y, point.Y);

    for (i = firstValidPath; i < pathCount; ++i) {
      path = paths.at(i);
      pointCount = path.length;

      for (j = 0; j < pointCount; ++j) {
        point = path.at(j);
        result.left = Math.min(point.X, result.left);
        result.right = Math.max(point.X, result.right);
        result.top = Math.min(point.Y, result.top);
        result.bottom = Math.max(point.Y, result.bottom);
      }
    }
    return result;
  }
}
