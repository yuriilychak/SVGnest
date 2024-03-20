import { Point } from "../geom";
import { EndType, JoinType } from "./enums";

export default class PolyNode {
  private _joinType: JoinType;
  private _endType: EndType;
  private _polygon: Point[];
  private _children: PolyNode[];

  constructor(
    joinType: JoinType = JoinType.Square,
    endType: EndType = EndType.OpenSquare
  ) {
    this._joinType = joinType;
    this._endType = endType;
    this._children = [];
    this._polygon = [];
  }

  public at(index: number): Point {
    return this._polygon[index];
  }

  public add(point: Point): void {
    this._polygon.push(point);
  }

  public reverse(): void {
    this._polygon.reverse();
  }

  public addChild(child: PolyNode): void {
    this._children.push(child);
  }

  public childAt(index: number): PolyNode {
    return this._children[index];
  }

  public get joinType(): JoinType {
    return this._joinType;
  }

  public get endType(): EndType {
    return this._endType;
  }

  public get childCount(): number {
    return this._children.length;
  }

  public get polygon(): Point[] {
    return this._polygon;
  }
  public get area(): number {
    const pointCount: number = this._polygon.length;

    if (pointCount < 3) {
      return 0;
    }

    let result: number = 0;
    let i: number = 0;
    let currPoint: Point;
    let prevPoint: Point;

    for (i = 0; i < pointCount; ++i) {
      currPoint = this._polygon.at(i);
      prevPoint = this._polygon.at((i + pointCount - 1) % pointCount);
      result += (prevPoint.x + currPoint.x) * (prevPoint.y - currPoint.y);
    }

    return -result * 0.5;
  }

  public get orientation(): boolean {
    return this.area >= 0;
  }
}
