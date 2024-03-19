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

      if (outRec.pointer !== null) {
        outRec.pointer.dispose();
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

      if (outRec.pointer === null || outRec.pointer.prev === null) {
        continue;
      }

      outPt = outRec.pointer.prev;
      pointCount = outPt.pointCount;

      if (pointCount < 2) {
        continue;
      }

      polygon = new Array(pointCount);

      for (j = 0; j < pointCount; ++j) {
        polygon[j] = outPt.point;
        outPt = outPt.prev;
      }

      result.push(polygon);
    }

    return result;
  }

  public createHorizontalJoin(horzEdge: TEdge): Join {
    let outPt: OutPt = this._data.at(horzEdge.outIndex).pointer;
    if (horzEdge.side != EdgeSide.Left) {
      outPt = outPt.prev;
    }

    const point: IntPoint = outPt.point.equal(horzEdge.top)
      ? horzEdge.bottom
      : horzEdge.top;

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
      if (outRec.pointer === null || outRec.isOpen) continue;
      //@ts-ignore
      if ((outRec.isHole ^ reverseSolution) == outRec.area > 0)
        outRec.reverse();
    }

    for (var i = 0, ilen = joins.length; i < ilen; i++) {
      this._joinCommonEdges(joins[i], useFullRange, reverseSolution);
    }

    for (var i = 0, ilen = this._data.length; i < ilen; i++) {
      var outRec = this._data[i];
      if (outRec.pointer !== null && !outRec.isOpen)
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
    if (e2.windDelta == 0) this.addOutPt(e2, pt);
    if (e1.outIndex == e2.outIndex) {
      e1.outIndex = -1;
      e2.outIndex = -1;
    } else if (e1.outIndex < e2.outIndex)
      this._appendPolygon(e1, e2, activeEdges);
    else this._appendPolygon(e2, e1, activeEdges);
  }

  public addOutPt(edge: TEdge, point: IntPoint) {
    var ToFront = edge.side == EdgeSide.Left;
    if (edge.outIndex < 0) {
      var outRec: OutRec = this._createRec();
      outRec.isOpen = edge.windDelta === 0;
      var newOp: OutPt = new OutPt();
      outRec.pointer = newOp;
      newOp.index = outRec.index;
      //newOp.Pt = pt;
      newOp.point.set(point);
      newOp.next = newOp;
      newOp.prev = newOp;
      if (!outRec.isOpen) this._setHoleState(edge, outRec);
      edge.outIndex = outRec.index;
      //nb: do this after SetZ !
      return newOp;
    } else {
      var outRec = this._data[edge.outIndex];
      //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
      var op = outRec.pointer;
      if (ToFront && IntPoint.equal(point, op.point)) return op;
      else if (!ToFront && IntPoint.equal(point, op.prev.point)) return op.prev;
      var newOp = new OutPt();
      newOp.index = outRec.index;
      //newOp.Pt = pt;
      newOp.point.x = point.x;
      newOp.point.y = point.y;
      newOp.next = op;
      newOp.prev = op.prev;
      newOp.prev.next = newOp;
      op.prev = newOp;
      if (ToFront) outRec.pointer = newOp;

      return newOp;
    }
  }

  private _simplify() {
    var i = 0;
    while (i < this._data.length) {
      var outrec = this._data[i++];
      var op = outrec.pointer;
      if (op === null) continue;
      do //for each Pt in Polygon until duplicate found do ...
      {
        var op2 = op.next;
        while (op2 != outrec.pointer) {
          if (
            IntPoint.equal(op.point, op2.point) &&
            op2.next != op &&
            op2.prev != op
          ) {
            //split the polygon into two ...
            var op3 = op.prev;
            var op4 = op2.prev;
            op.prev = op4;
            op4.next = op;
            op2.prev = op3;
            op3.next = op2;
            outrec.pointer = op;
            var outrec2 = this._createRec();
            outrec2.pointer = op2;
            outrec2.updateOutPtIdxs();
            if (OutPt.poly2ContainsPoly1(outrec2.pointer, outrec.pointer)) {
              //OutRec2 is contained by OutRec1 ...
              outrec2.isHole = !outrec.isHole;
              outrec2.left = outrec;
            } else if (
              OutPt.poly2ContainsPoly1(outrec.pointer, outrec2.pointer)
            ) {
              //OutRec1 is contained by OutRec2 ...
              outrec2.isHole = outrec.isHole;
              outrec.isHole = !outrec2.isHole;
              outrec2.left = outrec.left;
              outrec.left = outrec2;
            } else {
              //the 2 polygons are separate ...
              outrec2.isHole = outrec.isHole;
              outrec2.left = outrec.left;
            }
            op2 = op;
            //ie get ready for the next iteration
          }
          op2 = op2.next;
        }
        op = op.next;
      } while (op != outrec.pointer);
    }
  }

  private _appendPolygon(e1: TEdge, e2: TEdge, activeEdges: TEdge): void {
    //get the start and ends of both output polygons ...
    var outRec1 = this._data[e1.outIndex];
    var outRec2 = this._data[e2.outIndex];
    var holeStateRec;
    if (OutRec.param1RightOfParam2(outRec1, outRec2)) holeStateRec = outRec2;
    else if (OutRec.param1RightOfParam2(outRec2, outRec1))
      holeStateRec = outRec1;
    else holeStateRec = OutRec.getLowermostRec(outRec1, outRec2);
    var p1_lft = outRec1.pointer;
    var p1_rt = p1_lft.prev;
    var p2_lft = outRec2.pointer;
    var p2_rt = p2_lft.prev;
    var side;
    //join e2 poly onto e1 poly and delete pointers to e2 ...
    if (e1.side == EdgeSide.Left) {
      if (e2.side == EdgeSide.Left) {
        //z y x a b c
        p2_lft.reverse();
        p2_lft.next = p1_lft;
        p1_lft.prev = p2_lft;
        p1_rt.next = p2_rt;
        p2_rt.prev = p1_rt;
        outRec1.pointer = p2_rt;
      } else {
        //x y z a b c
        p2_rt.next = p1_lft;
        p1_lft.prev = p2_rt;
        p2_lft.prev = p1_rt;
        p1_rt.next = p2_lft;
        outRec1.pointer = p2_lft;
      }
      side = EdgeSide.Left;
    } else {
      if (e2.side == EdgeSide.Right) {
        //a b c z y x
        p2_lft.reverse();
        p1_rt.next = p2_rt;
        p2_rt.prev = p1_rt;
        p2_lft.next = p1_lft;
        p1_lft.prev = p2_lft;
      } else {
        //a b c x y z
        p1_rt.next = p2_lft;
        p2_lft.prev = p1_rt;
        p1_lft.prev = p2_rt;
        p2_rt.next = p1_lft;
      }
      side = EdgeSide.Right;
    }
    outRec1.bottom = null;
    if (holeStateRec == outRec2) {
      if (outRec2.left != outRec1) outRec1.left = outRec2.left;
      outRec1.isHole = outRec2.isHole;
    }
    outRec2.pointer = null;
    outRec2.bottom = null;
    outRec2.left = outRec1;
    var OKIdx = e1.outIndex;
    var ObsoleteIdx = e2.outIndex;
    e1.outIndex = -1;
    //nb: safe because we only get here via AddLocalMaxPoly
    e2.outIndex = -1;
    var e = activeEdges;
    while (e !== null) {
      if (e.outIndex == ObsoleteIdx) {
        e.outIndex = OKIdx;
        e.side = side;
        break;
      }
      e = e.nextInAEL;
    }
    outRec2.index = outRec1.index;
  }

  private _joinCommonEdges(
    join: Join,
    useFullRange: boolean,
    reverseSolution: boolean
  ) {
    let outRec1: OutRec = this._getRec(join.pointer1.index);
    let outRec2: OutRec = this._getRec(join.pointer2.index);

    if (outRec1.pointer == null || outRec2.pointer == null) {
      return;
    }

    const holeStateRec: OutRec = OutRec.getHoleStartRec(outRec1, outRec2);

    if (!join.joinPoints(outRec1, outRec2, useFullRange)) {
      return;
    }

    if (outRec1 == outRec2) {
      outRec1.pointer = join.pointer1;
      outRec1.bottom = null;
      outRec2 = this._createRec();
      outRec2.pointer = join.pointer2;
      outRec2.updateOutPtIdxs();

      if (OutPt.poly2ContainsPoly1(outRec2.pointer, outRec1.pointer)) {
        outRec2.isHole = !outRec1.isHole;
        outRec2.left = outRec1;
        //@ts-ignore
        if ((outRec2.isHole ^ reverseSolution) == outRec2.area > 0) {
          outRec2.reverse();
        }
      } else if (OutPt.poly2ContainsPoly1(outRec1.pointer, outRec2.pointer)) {
        //outRec1 is contained by outRec2 ...
        outRec2.isHole = outRec1.isHole;
        outRec1.isHole = !outRec2.isHole;
        outRec2.left = outRec1.left;
        outRec1.left = outRec2;
        if (
          //@ts-ignore
          (outRec1.isHole ^ reverseSolution) ==
          outRec1.area > 0
        ) {
          outRec1.reverse();
        }
      } else {
        //the 2 polygons are completely separate ...
        outRec2.isHole = outRec1.isHole;
        outRec2.left = outRec1.left;
      }
    } else {
      //joined 2 polygons together ...
      outRec2.pointer = null;
      outRec2.bottom = null;
      outRec2.index = outRec1.index;
      outRec1.isHole = holeStateRec.isHole;

      if (holeStateRec == outRec2) {
        outRec1.left = outRec2.left;
      }
      outRec2.left = outRec1;
    }
  }

  private _setHoleState(edge: TEdge, outRec: OutRec): void {
    let isHole: boolean = false;
    let tmpEdge: TEdge = edge.prevInAEL;

    while (tmpEdge !== null) {
      if (tmpEdge.outIndex >= 0 && tmpEdge.windDelta != 0) {
        isHole = !isHole;
        if (outRec.left === null) outRec.left = this._data[tmpEdge.outIndex];
      }
      tmpEdge = tmpEdge.prevInAEL;
    }

    if (isHole) {
      outRec.isHole = true;
    }
  }

  private _getRec(index: number): OutRec {
    let result: OutRec = this._data[index];

    while (result !== this._data[result.index]) {
      result = this._data[result.index];
    }

    return result;
  }

  private _createRec(): OutRec {
    const result: OutRec = new OutRec(this._data.length);
    this._data.push(result);

    return result;
  }
}
