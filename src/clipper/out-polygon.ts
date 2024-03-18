import { EdgeSide } from "./enums";
import IntPoint from "./int-point";
import Join from "./join";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./edge/t-edge";

export default class OutPolygon {
  private _data: OutRec[];

  constructor() {
    this._data = [];
  }

  public dispose(): void {
    const recordCount: number = this._data.length;
    let i: number = 0;
    let outRec: OutRec;

    for (i = 0; i < recordCount; ++i) {
      outRec = this._data.at(i);

      if (outRec.Pts !== null) {
        outRec.Pts.dispose();
      }

      this._data[i] = null;
    }

    this._data.length = 0;
  }

  public build(result: IntPoint[][]): IntPoint[][] {
    result.length = 0;

    const recordCount: number = this._data.length;
    let i: number = 0;
    let j: number = 0;
    let outRec: OutRec;
    let outPt: OutPt;
    let pointCount: number;
    let polygon: IntPoint[];

    for (i = 0; i < recordCount; ++i) {
      outRec = this._data.at(i);

      if (outRec.Pts === null || outRec.Pts.Prev === null) {
        continue;
      }

      outPt = outRec.Pts.Prev;
      pointCount = outPt.pointCount;

      if (pointCount < 2) {
        continue;
      }

      polygon = new Array(pointCount);

      for (j = 0; j < pointCount; ++j) {
        polygon[j] = outPt.Pt;
        outPt = outPt.Prev;
      }

      result.push(polygon);
    }

    return result;
  }

  public createHorizontalJoin(horzEdge: TEdge): Join {
    let outPt: OutPt = this._data.at(horzEdge.OutIdx).Pts;
    if (horzEdge.Side != EdgeSide.Left) {
      outPt = outPt.Prev;
    }

    const point: IntPoint = outPt.Pt.equal(horzEdge.Top)
      ? horzEdge.Bot
      : horzEdge.Top;

    return new Join(outPt, null, point);
  }

  public fixOrientations(
    joins: Join[],
    reverseSolution: boolean,
    useFullRange: boolean,
    strictlySimple: boolean
  ): void {
    //fix orientations ...
    for (var i = 0, ilen = this._data.length; i < ilen; i++) {
      var outRec = this._data[i];
      if (outRec.Pts === null || outRec.IsOpen) continue;
      //@ts-ignore
      if ((outRec.IsHole ^ reverseSolution) == outRec.area > 0)
        outRec.reverse();
    }

    for (var i = 0, ilen = joins.length; i < ilen; i++) {
      this._joinCommonEdges(joins[i], useFullRange, reverseSolution);
    }

    for (var i = 0, ilen = this._data.length; i < ilen; i++) {
      var outRec = this._data[i];
      if (outRec.Pts !== null && !outRec.IsOpen)
        outRec.fixupOutPolygon(useFullRange, false);
    }
    if (strictlySimple) {
      this._simplify();
    }
  }

  public addLocalMaxPoly(
    e1: TEdge,
    e2: TEdge,
    pt: IntPoint,
    activeEdges: TEdge
  ): void {
    this.addOutPt(e1, pt);
    if (e2.WindDelta == 0) this.addOutPt(e2, pt);
    if (e1.OutIdx == e2.OutIdx) {
      e1.OutIdx = -1;
      e2.OutIdx = -1;
    } else if (e1.OutIdx < e2.OutIdx) this._appendPolygon(e1, e2, activeEdges);
    else this._appendPolygon(e2, e1, activeEdges);
  }

  public addOutPt(edge: TEdge, point: IntPoint) {
    var ToFront = edge.Side == EdgeSide.Left;
    if (edge.OutIdx < 0) {
      var outRec: OutRec = this._createRec();
      outRec.IsOpen = edge.WindDelta === 0;
      var newOp: OutPt = new OutPt();
      outRec.Pts = newOp;
      newOp.Idx = outRec.Idx;
      //newOp.Pt = pt;
      newOp.Pt.X = point.X;
      newOp.Pt.Y = point.Y;
      newOp.Next = newOp;
      newOp.Prev = newOp;
      if (!outRec.IsOpen) this._setHoleState(edge, outRec);
      edge.OutIdx = outRec.Idx;
      //nb: do this after SetZ !
      return newOp;
    } else {
      var outRec = this._data[edge.OutIdx];
      //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
      var op = outRec.Pts;
      if (ToFront && IntPoint.equal(point, op.Pt)) return op;
      else if (!ToFront && IntPoint.equal(point, op.Prev.Pt)) return op.Prev;
      var newOp = new OutPt();
      newOp.Idx = outRec.Idx;
      //newOp.Pt = pt;
      newOp.Pt.X = point.X;
      newOp.Pt.Y = point.Y;
      newOp.Next = op;
      newOp.Prev = op.Prev;
      newOp.Prev.Next = newOp;
      op.Prev = newOp;
      if (ToFront) outRec.Pts = newOp;

      return newOp;
    }
  }

  private _simplify() {
    var i = 0;
    while (i < this._data.length) {
      var outrec = this._data[i++];
      var op = outrec.Pts;
      if (op === null) continue;
      do //for each Pt in Polygon until duplicate found do ...
      {
        var op2 = op.Next;
        while (op2 != outrec.Pts) {
          if (
            IntPoint.equal(op.Pt, op2.Pt) &&
            op2.Next != op &&
            op2.Prev != op
          ) {
            //split the polygon into two ...
            var op3 = op.Prev;
            var op4 = op2.Prev;
            op.Prev = op4;
            op4.Next = op;
            op2.Prev = op3;
            op3.Next = op2;
            outrec.Pts = op;
            var outrec2 = this._createRec();
            outrec2.Pts = op2;
            outrec2.updateOutPtIdxs();
            if (OutPt.poly2ContainsPoly1(outrec2.Pts, outrec.Pts)) {
              //OutRec2 is contained by OutRec1 ...
              outrec2.IsHole = !outrec.IsHole;
              outrec2.FirstLeft = outrec;
            } else if (OutPt.poly2ContainsPoly1(outrec.Pts, outrec2.Pts)) {
              //OutRec1 is contained by OutRec2 ...
              outrec2.IsHole = outrec.IsHole;
              outrec.IsHole = !outrec2.IsHole;
              outrec2.FirstLeft = outrec.FirstLeft;
              outrec.FirstLeft = outrec2;
            } else {
              //the 2 polygons are separate ...
              outrec2.IsHole = outrec.IsHole;
              outrec2.FirstLeft = outrec.FirstLeft;
            }
            op2 = op;
            //ie get ready for the next iteration
          }
          op2 = op2.Next;
        }
        op = op.Next;
      } while (op != outrec.Pts);
    }
  }

  private _appendPolygon(e1: TEdge, e2: TEdge, activeEdges: TEdge): void {
    //get the start and ends of both output polygons ...
    var outRec1 = this._data[e1.OutIdx];
    var outRec2 = this._data[e2.OutIdx];
    var holeStateRec;
    if (OutRec.param1RightOfParam2(outRec1, outRec2)) holeStateRec = outRec2;
    else if (OutRec.param1RightOfParam2(outRec2, outRec1))
      holeStateRec = outRec1;
    else holeStateRec = OutRec.getLowermostRec(outRec1, outRec2);
    var p1_lft = outRec1.Pts;
    var p1_rt = p1_lft.Prev;
    var p2_lft = outRec2.Pts;
    var p2_rt = p2_lft.Prev;
    var side;
    //join e2 poly onto e1 poly and delete pointers to e2 ...
    if (e1.Side == EdgeSide.Left) {
      if (e2.Side == EdgeSide.Left) {
        //z y x a b c
        p2_lft.reverse();
        p2_lft.Next = p1_lft;
        p1_lft.Prev = p2_lft;
        p1_rt.Next = p2_rt;
        p2_rt.Prev = p1_rt;
        outRec1.Pts = p2_rt;
      } else {
        //x y z a b c
        p2_rt.Next = p1_lft;
        p1_lft.Prev = p2_rt;
        p2_lft.Prev = p1_rt;
        p1_rt.Next = p2_lft;
        outRec1.Pts = p2_lft;
      }
      side = EdgeSide.Left;
    } else {
      if (e2.Side == EdgeSide.Right) {
        //a b c z y x
        p2_lft.reverse();
        p1_rt.Next = p2_rt;
        p2_rt.Prev = p1_rt;
        p2_lft.Next = p1_lft;
        p1_lft.Prev = p2_lft;
      } else {
        //a b c x y z
        p1_rt.Next = p2_lft;
        p2_lft.Prev = p1_rt;
        p1_lft.Prev = p2_rt;
        p2_rt.Next = p1_lft;
      }
      side = EdgeSide.Right;
    }
    outRec1.BottomPt = null;
    if (holeStateRec == outRec2) {
      if (outRec2.FirstLeft != outRec1) outRec1.FirstLeft = outRec2.FirstLeft;
      outRec1.IsHole = outRec2.IsHole;
    }
    outRec2.Pts = null;
    outRec2.BottomPt = null;
    outRec2.FirstLeft = outRec1;
    var OKIdx = e1.OutIdx;
    var ObsoleteIdx = e2.OutIdx;
    e1.OutIdx = -1;
    //nb: safe because we only get here via AddLocalMaxPoly
    e2.OutIdx = -1;
    var e = activeEdges;
    while (e !== null) {
      if (e.OutIdx == ObsoleteIdx) {
        e.OutIdx = OKIdx;
        e.Side = side;
        break;
      }
      e = e.NextInAEL;
    }
    outRec2.Idx = outRec1.Idx;
  }

  private _joinCommonEdges(
    join: Join,
    useFullRange: boolean,
    reverseSolution: boolean
  ) {
    let outRec1: OutRec = this._getRec(join.OutPt1.Idx);
    let outRec2: OutRec = this._getRec(join.OutPt2.Idx);

    if (outRec1.Pts == null || outRec2.Pts == null) {
      return;
    }
    //get the polygon fragment with the correct hole state (FirstLeft)
    //before calling JoinPoints() ...
    const holeStateRec: OutRec = OutRec.getHoleStartRec(outRec1, outRec2);

    if (!join.joinPoints(outRec1, outRec2, useFullRange)) {
      return;
    }

    if (outRec1 == outRec2) {
      //instead of joining two polygons, we've just created a new one by
      //splitting one polygon into two.
      outRec1.Pts = join.OutPt1;
      outRec1.BottomPt = null;
      outRec2 = this._createRec();
      outRec2.Pts = join.OutPt2;
      //update all OutRec2.Pts Idx's ...
      outRec2.updateOutPtIdxs();
      //We now need to check every OutRec.FirstLeft pointer. If it points
      //to OutRec1 it may need to point to OutRec2 instead ...
      if (OutPt.poly2ContainsPoly1(outRec2.Pts, outRec1.Pts)) {
        //outRec2 is contained by outRec1 ...
        outRec2.IsHole = !outRec1.IsHole;
        outRec2.FirstLeft = outRec1;
        //@ts-ignore
        if ((outRec2.IsHole ^ reverseSolution) == outRec2.area > 0) {
          outRec2.reverse();
        }
      } else if (OutPt.poly2ContainsPoly1(outRec1.Pts, outRec2.Pts)) {
        //outRec1 is contained by outRec2 ...
        outRec2.IsHole = outRec1.IsHole;
        outRec1.IsHole = !outRec2.IsHole;
        outRec2.FirstLeft = outRec1.FirstLeft;
        outRec1.FirstLeft = outRec2;
        if (
          //@ts-ignore
          (outRec1.IsHole ^ reverseSolution) ==
          outRec1.area > 0
        ) {
          outRec1.reverse();
        }
      } else {
        //the 2 polygons are completely separate ...
        outRec2.IsHole = outRec1.IsHole;
        outRec2.FirstLeft = outRec1.FirstLeft;
      }
    } else {
      //joined 2 polygons together ...
      outRec2.Pts = null;
      outRec2.BottomPt = null;
      outRec2.Idx = outRec1.Idx;
      outRec1.IsHole = holeStateRec.IsHole;

      if (holeStateRec == outRec2) {
        outRec1.FirstLeft = outRec2.FirstLeft;
      }
      outRec2.FirstLeft = outRec1;
    }
  }

  private _setHoleState(edge: TEdge, outRec: OutRec): void {
    let isHole: boolean = false;
    let tmpEdge: TEdge = edge.PrevInAEL;

    while (tmpEdge !== null) {
      if (tmpEdge.OutIdx >= 0 && tmpEdge.WindDelta != 0) {
        isHole = !isHole;
        if (outRec.FirstLeft === null)
          outRec.FirstLeft = this._data[tmpEdge.OutIdx];
      }
      tmpEdge = tmpEdge.PrevInAEL;
    }

    if (isHole) {
      outRec.IsHole = true;
    }
  }

  private _getRec(index: number): OutRec {
    let result: OutRec = this._data[index];

    while (result !== this._data[result.Idx]) {
      result = this._data[result.Idx];
    }

    return result;
  }

  private _createRec(): OutRec {
    const result: OutRec = new OutRec(this._data.length);
    this._data.push(result);

    return result;
  }
}
