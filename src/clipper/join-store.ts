import IntPoint from "./int-point";
import Join from "./join";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import TEdge from "./edge/t-edge";

export default class JoinStore {
  private _ghostJoins: Join[];
  private _joins: Join[];

  constructor() {
    this._ghostJoins = [];
    this._joins = [];
  }

  public add(outPt1: OutPt, outPt2: OutPt, point: IntPoint): void {
    this._joins.push(new Join(outPt1, outPt2, point));
  }

  public addGhost(
    outPolygon: OutPolygon,
    edge: TEdge,
    isTopOfScanbeam: boolean
  ): boolean {
    const canInsert: boolean =
      edge.OutIdx >= 0 && edge.WindDelta !== 0 && isTopOfScanbeam;

    if (canInsert) {
      this._ghostJoins.push(outPolygon.createHorizontalJoin(edge));
    }

    return canInsert;
  }

  public exportGhosts(outPt: OutPt, edge: TEdge): void {
    const joinCount: number = this._ghostJoins.length;

    if (
      outPt !== null &&
      edge.isHorizontal &&
      edge.WindDelta !== 0 &&
      joinCount !== 0
    ) {
      const joinCount: number = this._ghostJoins.length;
      let i: number = 0;
      let join: Join;

      for (i = 0; i < joinCount; ++i) {
        //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
        //the 'ghost' join to a real join ready for later ...
        join = this._ghostJoins[i];

        if (
          JoinStore._horzSegmentsOverlap(
            join.pointer1.Pt,
            join.point,
            edge.Bot,
            edge.Top
          )
        ) {
          this._joins.push(new Join(join.pointer1, outPt, join.point));
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
    pointA1: IntPoint,
    pointB1: IntPoint,
    pointA2: IntPoint,
    pointB2: IntPoint
  ): boolean {
    return (
      pointA1.X > pointA2.X === pointA1.X < pointB2.X ||
      pointB1.X > pointA2.X === pointB1.X < pointB2.X ||
      pointA2.X > pointA1.X === pointA2.X < pointB1.X ||
      pointB2.X > pointA1.X === pointB2.X < pointB1.X ||
      (pointA1.X == pointA2.X && pointB1.X == pointB2.X) ||
      (pointA1.X == pointB2.X && pointB1.X == pointA2.X)
    );
  }
}
