import Point from "./point";
import Rect from "./rect";
import { POLYGON_CONFIG_SIZE } from "./util";

export default class Polygon {
  private _id: i16;
  private _points: Point[];
  private _bounds: Rect;
  private _source: i16;
  private _area: f32;
  private _parent: Polygon | null = null;
  private _isValid: boolean;
  private _offset: Point;
  private _children: Polygon[];
  private _isHole: boolean;
  private _rotation: f32;

  constructor(data: Float32Array, offset: u16 = 0) {
    const currentOffset: u16 = offset + POLYGON_CONFIG_SIZE;
    const pointCount: u16 = u16(data[offset + 11]);
    let i: u16 = 0;

    const points: Point[] = new Array<Point>(pointCount);

    for (i = 0; i < pointCount; ++i) {
      points[i] = new Point(
        data[currentOffset + (i << 1)],
        data[currentOffset + (i << 1) + 1]
      );
    }

    this._id = i16(data[offset + 1]);
    this._source = i16(data[offset + 2]);
    this._isHole = data[offset + 3] === 1;
    this._rotation = data[offset + 4];
    this._points = points;
    this._children = new Array<Polygon>();
    this._offset = new Point(data[offset + 9], data[offset + 10]);
    this._isValid = pointCount >= 3;
    this._bounds = Polygon._getBounds(points);
    this._area = this._getArea();
  }

  public at(index: u16): Point | null {
    return this._points[index] || null;
  }

  public rotate(angle: f32): Polygon {
    const pointCount: u16 = this.length;
    const radianAngle: f32 = f32((angle * Math.PI) / 180);
    let i: u16 = 0;
    const data: Float32Array = this.export();
    const point: Point = new Point();

    for (i = 0; i < pointCount; ++i) {
      point.set(this._points[i]).rotate(radianAngle);
      Polygon.updatePoint(data, i, point);
    }

    const result = new Polygon(data);

    if (this.hasChildren) {
      const childCount: u16 = this.childCount;

      for (i = 0; i < childCount; ++i) {
        result.children[i] = this._children[i].rotate(angle);
      }
    }

    return result;
  }

  // return true if point is in the polygon, false if outside, and null if exactly on a point or edge
  public pointIn(point: Point): boolean {
    if (!this._isValid) {
      return false;
    }

    const innerPoint: Point = Point.from(point);
    const pointCount: u16 = this.length;
    let result: boolean = false;
    const currentPoint: Point = new Point();
    const prevPoint: Point = new Point();
    let i: u16 = 0;

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

      if (Point.almostEqual(currentPoint, prevPoint)) {
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
    if (!this._isValid) {
      return;
    }

    if (
      (this.firstPoint as Point).almostEqual(this._points[this.length - 1], 0)
    ) {
      this._points.push(this._points[0]);
    }
  }

  public export(): Float32Array {
    const pointCount: u16 = this.length;
    const size: u16 = POLYGON_CONFIG_SIZE + (pointCount << 1);
    const result = new Float32Array(size);
    let i: u16 = 0;

    result[0] = size;
    result[1] = this._id;
    result[2] = this._source;
    result[3] = this._isHole ? 1 : 0;
    result[4] = this._rotation;
    result[5] = this._bounds.x;
    result[6] = this._bounds.y;
    result[7] = this._bounds.width;
    result[8] = this._bounds.height;
    result[9] = this._offset.x;
    result[10] = this._offset.y;
    result[11] = pointCount;
    result[12] = this._parent !== null ? 1 : 0;
    result[13] = this._children.length;

    for (i = 0; i < pointCount; ++i) {
      Polygon.updatePoint(result, i, this._points[i]);
    }

    return result;
  }

  private _getBounds(): Rect {
    return Polygon._getBounds(this._points);
  }

  private _getArea(): f32 {
    if (!this._isValid) {
      return 0;
    }

    const pointCount: u16 = this.length;
    let result: f32 = 0;
    let i: u16 = 0;
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

  public get length(): u16 {
    return u16(this._points.length);
  }

  public get bound(): Rect | null {
    return this._bounds;
  }

  public get area(): f32 {
    return this._area;
  }

  public get firstPoint(): Point | null {
    return this._points[0] || null;
  }

  public get lastPoint(): Point | null {
    return this._points[this._points.length - 1] || null;
  }

  public get x(): f32 {
    return this._bounds.x;
  }

  public get y(): f32 {
    return this._bounds.y;
  }

  public get width(): f32 {
    return this._bounds.width;
  }

  public get height(): f32 {
    return this._bounds.height;
  }

  public get id(): u16 {
    return this._id;
  }

  public get offsetx(): f32 {
    return this._offset.x;
  }

  public get offsety(): f32 {
    return this._offset.y;
  }

  public get offset(): Point {
    return this._offset;
  }

  public get min(): Point {
    const result: Point = Point.from(this._points[0]);
    let i: u16 = 0;
    const pointCount: u16 = this.length;

    for (i = 1; i < pointCount; ++i) {
      result.min(this._points[i]);
    }

    return result;
  }

  public get max(): Point {
    const result: Point = Point.from(this._points[0]);
    let i: u16 = 0;
    const pointCount: u16 = this.length;

    for (i = 1; i < pointCount; ++i) {
      result.max(this._points[i]);
    }

    return result;
  }

  public get children(): Polygon[] {
    return this._children;
  }

  public get hasChildren(): boolean {
    return this.childCount > 0;
  }

  public get childCount(): u16 {
    return u16(this._children.length);
  }

  public get hole(): boolean {
    return this._isHole;
  }

  public set hole(value: boolean) {
    this._isHole = value;
  }

  public get source(): i16 {
    return this._source;
  }

  public get rotation(): f32 {
    return this._rotation;
  }

  public set rotation(value: f32) {
    this._rotation = value;
  }

  public static updatePoint(
    data: Float32Array,
    index: u16,
    point: Point,
    offset: u16 = 0
  ): void {
    const innerOffset: u16 = POLYGON_CONFIG_SIZE + offset + 2 * index;

    data[innerOffset] = point.x;
    data[innerOffset + 1] = point.y;
  }

  private static _getBounds(points: Point[]): Rect {
    if (points.length < 3) {
      return new Rect();
    }

    let point: Point = points[0];
    const pointCount: u16 = u16(points.length);
    const min: Point = Point.from(point);
    const max: Point = Point.from(point);
    let i: u16 = 0;

    for (i = 1; i < pointCount; ++i) {
      point = points[i];
      max.max(point);
      min.min(point);
    }

    return Rect.fromPoints(min, max);
  }
}
