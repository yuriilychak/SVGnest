import { IPolygon } from "../interfaces";
import Point from "./point";
import Rect from "./rect";
import { TripleStatus } from "../enums";

const POLYGON_CONFIG_SIZE: number = 10;

// returns the intersection of AB and EF
// or null if there are no intersections or other numerical error
// if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
function lineIntersect(a: Point, b: Point, e: Point, f: Point): boolean {
  const diffAB: Point = Point.sub(a, b);
  const diffEF: Point = Point.sub(e, f);
  const denom: number = diffEF.cross(diffAB);

  const crossAB: number = a.cross(b);
  const crossEF: number = e.cross(f);

  diffAB.scale(crossEF);
  diffEF.scale(crossAB);

  const point: Point = Point.from(diffEF)
    .sub(diffAB)
    .scale(1 / denom);

  return point.checkIntersect(a, b) && point.checkIntersect(e, f);
}

function updateIntersectPoints(
  polygon: Polygon,
  points: Point[],
  index: number
): void {
  const pointCount: number = polygon.length;
  const currentPoint: Point = polygon.at(index);
  const nextPoint: Point = polygon.at(index + 1);

  // go even further back if we happen to hit on a loop end point
  const prevOffset: number = Point.almostEqual(
    polygon.at((index + pointCount - 1) % pointCount),
    currentPoint
  )
    ? 2
    : 1;

  // go even further forward if we happen to hit on a loop end point
  const nextOffset: number = Point.almostEqual(
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

export default class Polygon {
  private _data: Float64Array;
  private _points: Point[];
  private _offset: Point;
  private _dataOffset: number;
  private _bounds: Rect;
  private _isValid: boolean;
  private _parent: Polygon | null = null;
  private _children: Polygon[];

  constructor(data: Float64Array, offset: number = 0) {
    const innerOffset: number = POLYGON_CONFIG_SIZE + offset;
    const size: number = data[offset];
    const pointCount: number = data[7 + offset];
    const hasParent: boolean = data[offset + 8] === 1;
    const childCount: number = data[offset + 9];
    let i: number = 0;
    let polygonOffset: number = size + offset;

    this._points = new Array<Point>(pointCount);
    this._data = data;
    this._dataOffset = offset;
    this._isValid = pointCount >= 3;
    this._children = new Array<Polygon>(childCount);

    this._offset = new Point(data, offset + 5);

    for (i = 0; i < pointCount; ++i) {
      this._points[i] = new Point(data, innerOffset + (i << 1));
    }

    if (hasParent) {
      this._parent = new Polygon(data, polygonOffset);
      polygonOffset += this._parent.dataSize;
    }

    this._bounds = this._calculateBounds();

    for (i = 0; i < childCount; ++i) {
      this._children[i] = new Polygon(data, polygonOffset);
      polygonOffset += this._children[i].dataSize;
    }
  }

  public at(index: number): Point {
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
    const pointCount: number = this.length;
    let inside: boolean = false;
    let i: number = 0;

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
    const sizeA: number = this.length;
    const sizeB: number = polygon.length;
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let condition: number = 0;

    for (i = 0; i < sizeA - 1; ++i) {
      updateIntersectPoints(this, pointsA, i);

      for (j = 0; j < sizeB - 1; ++j) {
        updateIntersectPoints(polygon, pointsB, j);

        for (k = 0; k < 4; ++k) {
          condition = this._checkIntersect(polygon, pointsA, pointsB, k);

          if (condition === 1) {
            return true;
          } else if (condition === 0) {
            break;
          }
        }

        if (condition === 0) {
          continue;
        }

        if (
          lineIntersect(
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
    indexData: number
  ): TripleStatus {
    const inputIndex: number = indexData >> 1;
    const outputIndex: number = indexData - (inputIndex << 1);
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

  private _getDataAt(index: number): number {
    return this._data[this._dataOffset + index];
  }

  private _setDataAt(index: number, value: number): void {
    this._data[this._dataOffset + index] = value;
  }

  private _calculateBounds(): Rect {
    if (!this._isValid) {
      return new Rect();
    }

    const pointCount: number = this.length;
    const min: Point = Point.from(this.at(0));
    const max: Point = Point.from(this.at(0));
    let i: number = 0;

    for (i = 1; i < pointCount; ++i) {
      max.max(this.at(i));
      min.min(this.at(i));
    }

    return Rect.fromPoints(min, max);
  }

  public get dataSize(): number {
    return this._getDataAt(0);
  }

  public get id(): number {
    return this._getDataAt(1);
  }

  public set id(value: number) {
    this._setDataAt(1, value);
  }

  public get source(): number {
    return this._getDataAt(2);
  }

  public set source(value: number) {
    this._setDataAt(2, value);
  }

  public get hole(): boolean {
    return this._getDataAt(3) === 1;
  }

  public set hole(value: boolean) {
    this._setDataAt(3, value ? 1 : 0);
  }

  public get rotation(): number {
    return this._getDataAt(4);
  }

  public set rotation(value: number) {
    this._setDataAt(4, value);
  }

  public get length(): number {
    return this._points.length;
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

  public get x(): number {
    return this._bounds.x;
  }

  public get y(): number {
    return this._bounds.y;
  }

  public get width(): number {
    return this._bounds.width;
  }

  public get height(): number {
    return this._bounds.height;
  }

  public get area(): number {
    if (!this._isValid) {
      return Number.NaN;
    }

    const pointCount: number = this.length;
    let result: number = 0;
    let i: number = 0;
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

  public static updatePoint(
    data: Float64Array,
    index: number,
    point: Point,
    offset: number = 0
  ): void {
    const innerOffset: number = POLYGON_CONFIG_SIZE + offset + 2 * index;

    data[innerOffset] = point.x;
    data[innerOffset + 1] = point.y;
  }

  //TODO: remove it when legcy polygons will be removed
  public static legacyToData(polygon: IPolygon): Float64Array {
    const pointCount: number = polygon.length;
    const size: number = POLYGON_CONFIG_SIZE + (pointCount << 1);
    const polygonData: Float64Array = new Float64Array(size);
    let i: number = 0;
    let result: Float64Array;

    polygonData[0] = size;
    polygonData[1] = polygon.id || -1;
    polygonData[2] = polygon.source || -1;
    polygonData[3] = polygon.hole ? 1 : 0;
    polygonData[4] = polygon.rotation || 0;
    polygonData[5] = polygon.offset ? polygon.offset.x : 0;
    polygonData[6] = polygon.offset ? polygon.offset.y : 0;
    polygonData[7] = pointCount;
    polygonData[8] = polygon.parent ? 1 : 0;
    polygonData[9] = polygon.children ? polygon.children.length : 0;

    for (i = 0; i < pointCount; ++i) {
      polygonData[POLYGON_CONFIG_SIZE + (i << 1)] = polygon.at(i).x;
      polygonData[POLYGON_CONFIG_SIZE + (i << 1) + 1] = polygon.at(i).y;
    }

    if (polygon.parent) {
      const parentData: Float64Array = Polygon.legacyToData(polygon.parent);

      result = new Float64Array(size + parentData.length);

      result.set(polygonData);
      result.set(parentData, size);

      return result;
    } else {
      return polygonData;
    }
  }

  //TODO: remove it when legcy polygons will be removed
  public static fromLegacy(polygon: IPolygon): Polygon {
    return new Polygon(Polygon.legacyToData(polygon));
  }

  public static fromPoints(points: Point[]): Polygon {
    const pointCount: number = points.length;
    const size: number = POLYGON_CONFIG_SIZE + (pointCount << 1);
    const data = new Float64Array(size);
    let i: number = 0;

    data[0] = size;
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
    const polygonCount: number = polygons.length;
    const polygonData: Float64Array[] = new Array<Float64Array>(polygonCount);
    const sizes: Float64Array = new Float64Array(polygonCount);
    let currentOffset: number = polygonCount + 1;
    let totalSize: number = currentOffset;
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
      polygonData[i] = polygons[i].export();
      sizes[i] = polygonData[i][0];
      totalSize += sizes[i];
    }

    const result: Float64Array = new Float64Array(totalSize);

    result[0] = polygonCount;
    result.set(sizes, 1);

    for (i = 0; i < polygonCount; ++i) {
      result.set(polygonData[i], currentOffset);
      currentOffset += sizes[i];
    }

    return result;
  }
}
