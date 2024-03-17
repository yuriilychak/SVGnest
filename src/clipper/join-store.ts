import IntPoint from "./int-point";
import Join from "./join";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import TEdge from "./t-edge";

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
            join.OutPt1.Pt,
            join.OffPt,
            edge.Bot,
            edge.Top
          )
        ) {
          this._joins.push(new Join(join.OutPt1, outPt, join.OffPt));
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
    Pt1a: IntPoint,
    Pt1b: IntPoint,
    Pt2a: IntPoint,
    Pt2b: IntPoint
  ): boolean {
    //precondition: both segments are horizontal
    if (Pt1a.X > Pt2a.X === Pt1a.X < Pt2b.X) return true;
    else if (Pt1b.X > Pt2a.X === Pt1b.X < Pt2b.X) return true;
    else if (Pt2a.X > Pt1a.X === Pt2a.X < Pt1b.X) return true;
    else if (Pt2b.X > Pt1a.X === Pt2b.X < Pt1b.X) return true;
    else if (Pt1a.X == Pt2a.X && Pt1b.X == Pt2b.X) return true;
    else if (Pt1a.X == Pt2b.X && Pt1b.X == Pt2a.X) return true;
    else return false;
  }
}
