import Point from "./point";
import Rect from "./rect";
import { TripleStatus } from "../enums";
import { almostEqual } from "../util";

const POLYGON_CONFIG_SIZE: u32 = 10;

export default class Polygon {
  private _data: Float64Array;
  private _points: Point[];
  private _offset: Point;
  private _dataOffset: u32;
  private _bounds: Rect;
  private _isValid: boolean;
  private _parent: Polygon | null = null;
  private _children: Polygon[];

  constructor(data: Float64Array, offset: u32 = 0) {
    const innerOffset: u32 = POLYGON_CONFIG_SIZE + offset;
    const size: u32 = u32(data[offset]);
    const pointCount: u16 = u16(data[7 + offset]);
    const hasParent: boolean = data[offset + 8] === 1;
    const childCount: u16 = u16(data[offset + 9]);
    let i: u16 = 0;
    let polygonOffset: u32 = size + offset;
    const points: Point[] = new Array<Point>(pointCount);

    for (i = 0; i < pointCount; ++i) {
      points[i] = new Point(data, innerOffset + (i << 1));
    }

    this._points = points;
    this._data = data;
    this._dataOffset = offset;
    this._isValid = pointCount >= 3;
    this._children = new Array<Polygon>(childCount);
    this._offset = new Point(data, offset + 5);
    this._bounds = Polygon._calculateBounds(points);

    if (hasParent) {
      this._parent = new Polygon(data, polygonOffset);
      polygonOffset += (this._parent as Polygon).dataSize;
    }

    for (i = 0; i < childCount; ++i) {
      this._children[i] = new Polygon(data, polygonOffset);
      polygonOffset += this._children[i].dataSize;
    }
  }

  public at(index: u16): Point {
    return this._points[index];
  }

  // return true if point is in the polygon, false if outside, and null if exactly on a point or edge
  public pointIn(point: Point): TripleStatus {
    if (!this._isValid) {
      return TripleStatus.Error;
    }

    const currentPoint: Point = Point.empty();
    const prevPoint: Point = Point.empty();
    const neighboarDiff: Point = Point.empty();
    const pointDiff: Point = Point.empty();
    const pointCount: u16 = this.length;
    let inside: boolean = false;
    let i: u16 = 0;

    for (i = 0; i < pointCount; ++i) {
      currentPoint.set(this._points[i]).add(this._offset);
      prevPoint
        .set(this._points[(i + pointCount - 1) % pointCount])
        .add(this._offset);

      if (
        // no result
        point.almostEqual(currentPoint) ||
        // exactly on the segment
        point.onSegment(currentPoint, prevPoint)
      ) {
        return TripleStatus.Error; // no result
      }

      if (currentPoint.almostEqual(prevPoint)) {
        // ignore very small lines
        continue;
      }

      neighboarDiff.set(prevPoint).sub(currentPoint);
      pointDiff.set(point).sub(currentPoint);

      if (
        0 > pointDiff.y != prevPoint.y > point.y &&
        neighboarDiff.cross(pointDiff) / neighboarDiff.y < 0
      ) {
        inside = !inside;
      }
    }

    return inside ? TripleStatus.True : TripleStatus.False;
  }

  public intersect(polygon: Polygon): boolean {
    const pointsA: Point[] = [
      Point.empty(),
      Point.empty(),
      Point.empty(),
      Point.empty()
    ];
    const pointsB: Point[] = [
      Point.empty(),
      Point.empty(),
      Point.empty(),
      Point.empty()
    ];
    const sizeA: u16 = this.length;
    const sizeB: u16 = polygon.length;
    let i: u16 = 0;
    let j: u16 = 0;
    let k: u16 = 0;
    let condition: TripleStatus = 0;

    for (i = 0; i < sizeA - 1; ++i) {
      Polygon._updateIntersectPoints(this, pointsA, i);

      for (j = 0; j < sizeB - 1; ++j) {
        Polygon._updateIntersectPoints(polygon, pointsB, j);

        for (k = 0; k < 4; ++k) {
          condition = this._checkIntersect(polygon, pointsA, pointsB, k);

          if (condition === TripleStatus.True) {
            return true;
          } else if (condition === TripleStatus.False) {
            break;
          }
        }

        if (condition === 0) {
          continue;
        }

        if (
          Polygon._lineIntersect(
            pointsB.at(1),
            pointsB.at(2),
            pointsA.at(1),
            pointsA.at(2)
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }

  public close(): void {
    if (this._points[0] != this._points[this.length - 1]) {
      this._points.push(this._points[0]);
    }
  }

  public clone(): Polygon {
    return new Polygon(this._data.slice(), this._dataOffset);
  }

  public export(): Float64Array {
    return this._data.slice(this._dataOffset, this._dataOffset + this.dataSize);
  }

  private _checkIntersect(
    polygon: Polygon,
    pointsA: Point[],
    pointsB: Point[],
    indexData: u16
  ): TripleStatus {
    const inputIndex: u16 = indexData >> 1;
    const outputIndex: u16 = indexData - (inputIndex << 1);
    const isReversed: boolean = inputIndex !== outputIndex;
    const inputPoints: Point[] = isReversed ? pointsA : pointsB;
    const outputPoints: Point[] = isReversed ? pointsB : pointsA;
    const currentPolygon: Polygon = isReversed ? polygon : this;
    const checkPoint: Point = inputPoints.at(inputIndex + 1);

    if (
      checkPoint.onSegment(outputPoints.at(1), outputPoints.at(2)) ||
      checkPoint.almostEqual(outputPoints.at(outputIndex + 1))
    ) {
      // if a point is on a segment, it could intersect or it could not. Check via the neighboring points
      const point1In: TripleStatus = currentPolygon.pointIn(
        inputPoints.at(inputIndex)
      );
      const point2In: TripleStatus = currentPolygon.pointIn(
        inputPoints.at(2 + inputIndex)
      );
      const condition: boolean =
        (point1In === TripleStatus.True && point2In === TripleStatus.False) ||
        (point1In === TripleStatus.False && point2In === TripleStatus.True);

      return condition ? TripleStatus.True : TripleStatus.False;
    }

    return TripleStatus.Error;
  }

  private _getDataAt(index: u32): f64 {
    return this._data[this._dataOffset + index];
  }

  private _setDataAt(index: u32, value: f64): void {
    this._data[this._dataOffset + index] = value;
  }

  public get dataSize(): u32 {
    return u32(this._getDataAt(0));
  }

  public get id(): i16 {
    return i16(this._getDataAt(1));
  }

  public set id(value: i16) {
    this._setDataAt(1, value);
  }

  public get source(): i16 {
    return i16(this._getDataAt(2));
  }

  public set source(value: i16) {
    this._setDataAt(2, value);
  }

  public get hole(): boolean {
    return this._getDataAt(3) === 1;
  }

  public set hole(value: boolean) {
    this._setDataAt(3, value ? 1 : 0);
  }

  public get rotation(): f64 {
    return this._getDataAt(4);
  }

  public set rotation(value: f64) {
    this._setDataAt(4, value);
  }

  public get length(): u16 {
    return u16(this._points.length);
  }

  public get offset(): Point {
    return this._offset;
  }

  public get hasParent(): boolean {
    return this._parent !== null;
  }

  public get parent(): Polygon | null {
    return this._parent;
  }

  public get x(): f64 {
    return this._bounds.x;
  }

  public get y(): f64 {
    return this._bounds.y;
  }

  public get width(): f64 {
    return this._bounds.width;
  }

  public get height(): f64 {
    return this._bounds.height;
  }

  public get area(): f64 {
    if (!this._isValid) {
      return Number.NaN;
    }

    const pointCount: u16 = this.length;
    let result: f64 = 0;
    let i: u16 = 0;
    let currentPoint: Point;
    let prevPoint: Point;

    for (i = 0; i < pointCount; ++i) {
      prevPoint = this.at((i - 1 + pointCount) % pointCount);
      currentPoint = this.at(i);
      result += (prevPoint.x + currentPoint.x) * (prevPoint.y - currentPoint.y);
    }

    return 0.5 * result;
  }

  public get children(): Polygon[] {
    return this._children;
  }

  public get hasChildren(): boolean {
    return this._children.length !== 0;
  }

  public get isValid(): boolean {
    return this.isValid;
  }

  public get firstPoint(): Point {
    return this._points[0];
  }

  public get min(): Point {
    let i: u16 = 0;
    const pointCount: u16 = this.length;
    const result: Point = Point.from(this.firstPoint);

    for (i = 1; i < pointCount; ++i) {
      result.min(this._points[i]);
    }

    return result;
  }

  public get max(): Point {
    let i: u16 = 0;
    const pointCount: u16 = this.length;
    const result: Point = Point.from(this.firstPoint);

    for (i = 1; i < pointCount; ++i) {
      result.max(this._points[i]);
    }

    return result;
  }

  public get isRectangle(): boolean {
    if (!this._isValid) {
      return false;
    }

    const pointCount: u16 = this.length;
    const bottomLeft: Point = this._bounds.bottomLeft;
    const topRight: Point = this._bounds.topRight;
    let i: u16 = 0;
    let point: Point;

    for (i = 0; i < pointCount; ++i) {
      point = this._points[i];

      if (
        (!almostEqual(point.x, bottomLeft.x) &&
          !almostEqual(point.x, topRight.x)) ||
        (!almostEqual(point.y, bottomLeft.y) &&
          !almostEqual(point.y, topRight.y))
      ) {
        return false;
      }
    }

    return true;
  }

  public static updatePoint(
    data: Float64Array,
    index: u16,
    point: Point,
    offset: u32 = 0
  ): void {
    const innerOffset: u32 = POLYGON_CONFIG_SIZE + offset + 2 * index;

    data[innerOffset] = point.x;
    data[innerOffset + 1] = point.y;
  }

  public static fromPoints(points: Point[]): Polygon {
    const pointCount: u16 = u16(points.length);
    const size: u32 = POLYGON_CONFIG_SIZE + (pointCount << 1);
    const data = new Float64Array(size);
    let i: u16 = 0;

    data[0] = f64(size);
    data[1] = -1; //  id
    data[2] = -1; //  source
    data[3] = 0; //   hole
    data[4] = 0; //   rotation
    data[5] = 0; //   offset x
    data[6] = 0; //  offset y
    data[7] = pointCount; //  point count
    data[8] = 0; //  has parent
    data[9] = 0; //  child count
    // Points
    for (i = 0; i < pointCount; ++i) {
      Polygon.updatePoint(data, i, points[i]);
    }

    return new Polygon(data);
  }

  public static exportPolygons(polygons: Polygon[]): Float64Array {
    const polygonCount: u32 = polygons.length;
    const polygonData: Float64Array[] = new Array<Float64Array>(polygonCount);
    const sizes: Float64Array = new Float64Array(polygonCount);
    let currentOffset: u32 = polygonCount + 1;
    let totalSize: u32 = currentOffset;
    let i: u32 = 0;

    for (i = 0; i < polygonCount; ++i) {
      polygonData[i] = polygons[i].export();
      sizes[i] = polygonData[i][0];
      totalSize += u32(sizes[i]);
    }

    const result: Float64Array = new Float64Array(totalSize);

    result[0] = polygonCount;
    result.set(sizes, 1);

    for (i = 0; i < polygonCount; ++i) {
      result.set(polygonData[i], currentOffset);
      currentOffset += u32(sizes[i]);
    }

    return result;
  }

  // returns the intersection of AB and EF
  // or null if there are no intersections or other numerical error
  // if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
  private static _lineIntersect(
    a: Point,
    b: Point,
    e: Point,
    f: Point
  ): boolean {
    const diffAB: Point = Point.sub(a, b);
    const diffEF: Point = Point.sub(e, f);
    const denom: f64 = diffEF.cross(diffAB);

    const crossAB: f64 = a.cross(b);
    const crossEF: f64 = e.cross(f);

    diffAB.scale(crossEF);
    diffEF.scale(crossAB);

    const point: Point = Point.from(diffEF)
      .sub(diffAB)
      .scale(1 / denom);

    return point.checkIntersect(a, b) && point.checkIntersect(e, f);
  }

  private static _updateIntersectPoints(
    polygon: Polygon,
    points: Point[],
    index: u16
  ): void {
    const pointCount: u16 = polygon.length;
    const currentPoint: Point = polygon.at(index);
    const nextPoint: Point = polygon.at(index + 1);

    // go even further back if we happen to hit on a loop end point
    const prevOffset: u16 = Point.almostEqual(
      polygon.at((index + pointCount - 1) % pointCount),
      currentPoint
    )
      ? 2
      : 1;

    // go even further forward if we happen to hit on a loop end point
    const nextOffset: u16 = Point.almostEqual(
      polygon.at((index + 2) % pointCount),
      nextPoint
    )
      ? 3
      : 2;

    points[0]
      .set(polygon.at((index + pointCount - prevOffset) % pointCount))
      .add(polygon.offset);
    points[1].set(currentPoint).add(polygon.offset);
    points[2].set(nextPoint).add(polygon.offset);
    points[3]
      .set(polygon.at((index + nextOffset) % pointCount))
      .add(polygon.offset);
  }

  private static _calculateBounds(points: Point[]): Rect {
    const pointCount: u16 = u16(points.length);

    if (pointCount < 3) {
      return new Rect();
    }

    const min: Point = Point.from(points[0]);
    const max: Point = Point.from(points[0]);
    let i: u16 = 0;

    for (i = 1; i < pointCount; ++i) {
      max.max(points[i]);
      min.min(points[i]);
    }

    return Rect.fromPoints(min, max);
  }
}
