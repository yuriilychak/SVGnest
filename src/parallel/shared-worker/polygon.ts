import { IPolygon } from "../../interfaces";
import Point from "../../point";
import Rect from "../../rect";

const POLYGON_CONFIG_SIZE: number = 10;

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

  public hasParent(): boolean {
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
    const offset: number = 14;
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
      polygonData[offset + (i << 1) + 1] = polygon.at(i).y;
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
}
