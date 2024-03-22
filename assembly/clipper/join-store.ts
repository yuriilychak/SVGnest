import Join from "./join";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import TEdge from "./edge/t-edge";
import { Point } from "../geom";

export default class JoinStore {
  private _ghostJoins: Join[];
  private _joins: Join[];

  constructor() {
    this._ghostJoins = [];
    this._joins = [];
  }

  public add(outPt1: OutPt, outPt2: OutPt, point: Point): void {
    this._joins.push(new Join(outPt1, outPt2, point));
  }

  public addGhost(
    outPolygon: OutPolygon,
    edge: TEdge,
    isTopOfScanbeam: boolean
  ): boolean {
    const canInsert: boolean =
      edge.outIndex >= 0 && edge.windDelta !== 0 && isTopOfScanbeam;

    if (canInsert) {
      this._ghostJoins.push(outPolygon.createHorizontalJoin(edge));
    }

    return canInsert;
  }

  public exportGhosts(outPt: OutPt, edge: TEdge): void {
    const joinCount: u16 = u16(this._ghostJoins.length);

    if (
      outPt !== null &&
      edge.isHorizontalY &&
      edge.windDelta !== 0 &&
      joinCount !== 0
    ) {
      const joinCount: u16 = u16(this._ghostJoins.length);
      let i: u16 = 0;
      let join: Join;

      for (i = 0; i < joinCount; ++i) {
        //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
        //the 'ghost' join to a real join ready for later ...
        join = this._ghostJoins[i];

        if (
          JoinStore._horzSegmentsOverlap(
            join.pointer1 as OutPt,
            join,
            edge.bottom,
            edge.top
          )
        ) {
          this._joins.push(new Join(join.pointer1, outPt, join));
        }
      }
    }
  }

  public clean(isClearAll: boolean): void {
    this._ghostJoins.length = 0;

    if (isClearAll) {
      this._joins.length = 0;
    }
  }

  public get joins(): Join[] {
    return this._joins;
  }

  private static _horzSegmentsOverlap(
    pointA1: Point,
    pointB1: Point,
    pointA2: Point,
    pointB2: Point
  ): boolean {
    return (
      pointA1.x > pointA2.x === pointA1.x < pointB2.x ||
      pointB1.x > pointA2.x === pointB1.x < pointB2.x ||
      pointA2.x > pointA1.x === pointA2.x < pointB1.x ||
      pointB2.x > pointA1.x === pointB2.x < pointB1.x ||
      (pointA1.x == pointA2.x && pointB1.x == pointB2.x) ||
      (pointA1.x == pointB2.x && pointB1.x == pointA2.x)
    );
  }
}
