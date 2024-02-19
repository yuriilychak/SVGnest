import FloatPoint from "./float-point";
import FloatRect from "./float-rect";
import { Point } from "./interfaces";

export default class FloatPolygon {
  private _id: number = -1;
  private _points: Array<FloatPoint>;
  private _bounds: FloatRect | null;
  private _area: number = 0;
  private _isValid: boolean;
  private _offset: FloatPoint;
  private _children: FloatPolygon[];

  constructor(points: Array<Point> = []) {
    this._points = points.map((point) => FloatPoint.from(point));
    this._isValid = this._points.length >= 3;
    this._children = [];

    if (!this._isValid) {
      return;
    }

    this._bounds = this._getBounds();
    this._area = this._getArea();
    this._offset = new FloatPoint();
  }

  public at(index: number): FloatPoint | null {
    return this._points[index] || null;
  }

  public rotate(angle: number): FloatPolygon {
    const points: Array<Point> = new Array<Point>();
    const pointCount: number = this.length;
    const radianAngle: number = (angle * Math.PI) / 180;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
      points.push(this._points[i].clone().rotate(radianAngle));
    }

    const result = new FloatPolygon(points);

    if (this.hasChildren) {
      const childCount: number = this.childCount;

      for (i = 0; i < childCount; ++i) {
        result.children.push(this._children[i].rotate(angle));
      }
    }

    return result;
  }

  // return true if point is in the polygon, false if outside, and null if exactly on a point or edge
  public pointIn(point: Point): boolean {
    if (!this._isValid) {
      return false;
    }

    const innerPoint: FloatPoint = FloatPoint.from(point);
    const pointCount = this._points.length;
    let result: boolean = false;
    const currentPoint: FloatPoint = new FloatPoint();
    const prevPoint: FloatPoint = new FloatPoint();
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
      currentPoint.set(this._points[i]).add(this._offset);
      prevPoint
        .set(this._points[(i - 1 + pointCount) % pointCount])
        .add(this._offset);

      if (
        innerPoint.almostEqual(currentPoint) ||
        innerPoint.onSegment(currentPoint, prevPoint)
      ) {
        return false; // no result or exactly on the segment
      }

      if (FloatPoint.almostEqual(currentPoint, prevPoint)) {
        // ignore very small lines
        continue;
      }

      if (
        currentPoint.y - point.y > 0 !== prevPoint.y - point.y > 0 &&
        point.x - currentPoint.x <
          ((prevPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
            (prevPoint.y - currentPoint.y)
      ) {
        result = !result;
      }
    }

    return result;
  }

  public close(): void {
    if (this._points[0] != this._points[this._points.length - 1]) {
      this._points.push(this._points[0]);
    }
  }

  private _getBounds(): FloatRect | null {
    if (!this._isValid) {
      return null;
    }

    let point: FloatPoint = this._points[0];
    const pointCount: number = this._points.length;
    const min: FloatPoint = FloatPoint.from(point);
    const max: FloatPoint = FloatPoint.from(point);
    let i: number = 0;

    for (i = 1; i < pointCount; ++i) {
      point = this._points[i];
      max.max(point);
      min.min(point);
    }

    return FloatRect.fromPoints(min, max);
  }

  private _getArea(): number {
    const pointCount: number = this._points.length;
    let result: number = 0;
    let i: number = 0;
    let currentPoint: Point;
    let prevPoint: Point;

    for (i = 0; i < pointCount; ++i) {
      prevPoint = this._points[(i - 1 + pointCount) % pointCount];
      currentPoint = this._points[i];
      result += (prevPoint.x + currentPoint.x) * (prevPoint.y - currentPoint.y);
    }

    return 0.5 * result;
  }

  public get isValid(): boolean {
    return this._isValid;
  }

  public get length(): number {
    return this._points.length;
  }

  public get bound(): FloatRect | null {
    return this._bounds;
  }

  public get area(): number {
    return this._area;
  }

  public get firstPoint(): FloatPoint | null {
    return this._points[0] || null;
  }

  public get x(): number {
    return this._bounds ? this._bounds.x : 0;
  }

  public get y(): number {
    return this._bounds ? this._bounds.y : 0;
  }

  public get width(): number {
    return this._bounds !== null ? this._bounds.width : 0;
  }

  public get height(): number {
    return this._bounds !== null ? this._bounds.height : 0;
  }

  public get id(): number {
    return this._id;
  }

  public get offsetx(): number {
    return this._offset.x;
  }

  public get offsety(): number {
    return this._offset.y;
  }

  public get offset(): FloatPoint {
    return this._offset;
  }

  public get min(): FloatPoint {
    const result = FloatPoint.from(this._points[0]);
    let i: number = 0;
    const pointCount = this._points.length;

    for (i = 1; i < pointCount; ++i) {
      result.min(this._points[i]);
    }

    return result;
  }

  public get max(): FloatPoint {
    const result = FloatPoint.from(this._points[0]);
    let i: number = 0;
    const pointCount = this._points.length;

    for (i = 1; i < pointCount; ++i) {
      result.max(this._points[i]);
    }

    return result;
  }

  public get children(): Array<FloatPolygon> {
    return this._children;
  }

  public get hasChildren(): boolean {
    return this._children.length > 0;
  }

  public get childCount(): number {
    return this._children.length;
  }
}
