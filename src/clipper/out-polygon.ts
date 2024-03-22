import { EdgeSide } from "./enums";
import Join from "./join";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./edge/t-edge";
import { Point } from "../geom";

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

      if (outRec.hasPointer) {
        outRec.pointer.dispose();
      }

      this._data[i] = null;
    }

    this._data.length = 0;
  }

  public build(result: Point[][]): Point[][] {
    result.length = 0;

    const recordCount: number = this._data.length;
    let i: number = 0;
    let j: number = 0;
    let outRec: OutRec;
    let outPt: OutPt;
    let pointCount: number;
    let polygon: Point[];

    for (i = 0; i < recordCount; ++i) {
      outRec = this._data.at(i);

      if (!outRec.hasPointer || outRec.pointer.prev === null) {
        continue;
      }

      outPt = outRec.pointer.prev;
      pointCount = outPt.pointCount;

      if (pointCount < 2) {
        continue;
      }

      polygon = new Array(pointCount);

      for (j = 0; j < pointCount; ++j) {
        polygon[j] = outPt;
        outPt = outPt.prev;
      }

      result.push(polygon);
    }

    return result;
  }

  public createHorizontalJoin(horzEdge: TEdge): Join {
    let outPt: OutPt = this._data.at(horzEdge.index).pointer;

    if (horzEdge.side != EdgeSide.Left) {
      outPt = outPt.prev;
    }

    const point: Point = outPt.equal(horzEdge.top)
      ? horzEdge.bottom
      : horzEdge.top;

    return new Join(outPt, null, point);
  }

  public fixOrientations(
    joins: Join[],
    reverseSolution: boolean,
    strictlySimple: boolean
  ): void {
    let i: number = 0;
    const recordCount: number = this._data.length;
    const joinCount: number = joins.length;
    let outRec: OutRec;

    for (i = 0; i < recordCount; ++i) {
      outRec = this._data[i];

      if (!outRec.hasPointer || outRec.isOpen) {
        continue;
      }

      //@ts-ignore
      if ((outRec.isHole ^ reverseSolution) == outRec.area > 0) {
        outRec.reverse();
      }
    }

    for (i = 0; i < joinCount; ++i) {
      this._joinCommonEdges(joins[i], reverseSolution);
    }

    for (i = 0; i < recordCount; ++i) {
      outRec = this._data[i];

      if (outRec.hasPointer && !outRec.isOpen) {
        outRec.fixupOutPolygon(false);
      }
    }

    if (strictlySimple) {
      this._simplify();
    }
  }

  public addLocalMaxPoly(
    edge1: TEdge,
    edge2: TEdge,
    point: Point,
    activeEdges: TEdge
  ): void {
    this.addOutPt(edge1, point);

    if (edge2.windDelta == 0) {
      this.addOutPt(edge2, point);
    }

    if (edge1.index === edge2.index) {
      edge1.clearIndex();
      edge2.clearIndex();
    } else if (edge1.index < edge2.index) {
      this._appendPolygon(edge1, edge2, activeEdges);
    } else {
      this._appendPolygon(edge2, edge1, activeEdges);
    }
  }

  public addOutPt(edge: TEdge, point: Point) {
    const isToFront: boolean = edge.side == EdgeSide.Left;
    let outRec: OutRec;
    let newOp: OutPt;

    if (!edge.isIndexDefined) {
      outRec = this._createRec();
      outRec.isOpen = edge.windDelta === 0;
      newOp = new OutPt();
      outRec.pointer = newOp;
      newOp.init(outRec.index, point, newOp, newOp);

      if (!outRec.isOpen) {
        this._setHoleState(edge, outRec);
      }

      edge.index = outRec.index;
      //nb: do this after SetZ !
      return newOp;
    }

    outRec = this._data[edge.index];

    const outPt: OutPt = outRec.pointer;

    if (isToFront && point.equal(outPt)) {
      return outPt;
    } else if (!isToFront && point.equal(outPt.prev)) {
      return outPt.prev;
    }

    newOp = new OutPt();
    newOp.init(outRec.index, point, outPt.prev, outPt);
    newOp.prev.next = newOp;
    outPt.prev = newOp;

    if (isToFront) {
      outRec.pointer = newOp;
    }

    return newOp;
  }

  private _simplify() {
    let i: number = 0;
    let outRec1: OutRec;
    let outRec2: OutRec;
    let outPt1: OutPt;
    let outPt2: OutPt;
    let outPt3: OutPt;
    let outPt4: OutPt;

    while (i < this._data.length) {
      outRec1 = this._data.at(i++);

      if (!outRec1.hasPointer) {
        continue;
      }

      outPt1 = outRec1.pointer;

      do //for each Pt in Polygon until duplicate found do ...
      {
        outPt2 = outPt1.next;

        while (outPt2 != outRec1.pointer) {
          if (
            outPt1.equal(outPt2) &&
            outPt2.next != outPt1 &&
            outPt2.prev != outPt1
          ) {
            outPt3 = outPt1.prev;
            outPt4 = outPt2.prev;
            outPt1.prev = outPt4;
            outPt4.next = outPt1;
            outPt2.prev = outPt3;
            outPt3.next = outPt2;
            outRec1.pointer = outPt1;
            outRec2 = this._createRec();
            outRec2.pointer = outPt2;
            outRec2.updateOutPtIdxs();

            if (OutPt.poly2ContainsPoly1(outRec2.pointer, outRec1.pointer)) {
              outRec2.isHole = !outRec1.isHole;
              outRec2.left = outRec1;
            } else if (
              OutPt.poly2ContainsPoly1(outRec1.pointer, outRec2.pointer)
            ) {
              outRec2.isHole = outRec1.isHole;
              outRec1.isHole = !outRec2.isHole;
              outRec2.left = outRec1.left;
              outRec1.left = outRec2;
            } else {
              outRec2.isHole = outRec1.isHole;
              outRec2.left = outRec1.left;
            }

            outPt2 = outPt1;
          }

          outPt2 = outPt2.next;
        }

        outPt1 = outPt1.next;
      } while (outPt1 !== outRec1.pointer);
    }
  }

  private _appendPolygon(edge1: TEdge, edge2: TEdge, activeEdges: TEdge): void {
    //get the start and ends of both output polygons ...
    const outRec1: OutRec = this._data[edge1.index];
    const outRec2: OutRec = this._data[edge2.index];
    let holeStateRec: OutRec;

    if (OutRec.param1RightOfParam2(outRec1, outRec2)) {
      holeStateRec = outRec2;
    } else if (OutRec.param1RightOfParam2(outRec2, outRec1)) {
      holeStateRec = outRec1;
    } else {
      holeStateRec = OutRec.getLowermostRec(outRec1, outRec2);
    }

    let leftPointer1: OutPt = outRec1.pointer;
    let rightPointer1: OutPt = leftPointer1.prev;
    let leftPointer2: OutPt = outRec2.pointer;
    let rightPointer2: OutPt = leftPointer2.prev;
    let side: EdgeSide;

    //join e2 poly onto e1 poly and delete pointers to e2 ...
    if (edge1.side == EdgeSide.Left) {
      if (edge2.side == EdgeSide.Left) {
        //z y x a b c
        leftPointer2.reversePointer();
        leftPointer2.next = leftPointer1;
        leftPointer1.prev = leftPointer2;
        rightPointer1.next = rightPointer2;
        rightPointer2.prev = rightPointer1;
        outRec1.pointer = rightPointer2;
      } else {
        //x y z a b c
        rightPointer2.next = leftPointer1;
        leftPointer1.prev = rightPointer2;
        leftPointer2.prev = rightPointer1;
        rightPointer1.next = leftPointer2;
        outRec1.pointer = leftPointer2;
      }
      side = EdgeSide.Left;
    } else {
      if (edge2.side == EdgeSide.Right) {
        leftPointer2.reversePointer();
        rightPointer1.next = rightPointer2;
        rightPointer2.prev = rightPointer1;
        leftPointer2.next = leftPointer1;
        leftPointer1.prev = leftPointer2;
      } else {
        rightPointer1.next = leftPointer2;
        leftPointer2.prev = rightPointer1;
        leftPointer1.prev = rightPointer2;
        rightPointer2.next = leftPointer1;
      }
      side = EdgeSide.Right;
    }

    outRec1.cleanBottom();

    if (holeStateRec == outRec2) {
      if (outRec2.left != outRec1) {
        outRec1.left = outRec2.left;
      }
      outRec1.isHole = outRec2.isHole;
    }

    outRec2.pointer = null;
    outRec2.cleanBottom();
    outRec2.left = outRec1;

    const newIndex: number = edge1.index;
    const obsoleteIndex: number = edge2.index;

    edge1.clearIndex();
    edge2.clearIndex();

    let edge: TEdge = activeEdges;

    while (edge !== null) {
      if (edge.index == obsoleteIndex) {
        edge.index = newIndex;
        edge.side = side;
        break;
      }
      edge = edge.ael.next;
    }
    outRec2.index = outRec1.index;
  }

  private _joinCommonEdges(join: Join, reverseSolution: boolean) {
    const outRec1: OutRec = this._getRec(join.pointer1.index);
    let outRec2: OutRec = this._getRec(join.pointer2.index);

    if (!outRec1.hasPointer || !outRec2.hasPointer) {
      return;
    }

    const holeStateRec: OutRec = OutRec.getHoleStartRec(outRec1, outRec2);

    if (!join.joinPoints(outRec1, outRec2)) {
      return;
    }

    if (outRec1 == outRec2) {
      outRec1.pointer = join.pointer1;
      outRec1.cleanBottom();
      outRec2 = this._createRec();
      outRec2.pointer = join.pointer2;
      outRec2.updateOutPtIdxs();

      if (OutPt.poly2ContainsPoly1(outRec2.pointer, outRec1.pointer)) {
        outRec2.isHole = !outRec1.isHole;
        outRec2.left = outRec1;

        if (outRec2.checkArea(reverseSolution)) {
          outRec2.reverse();
        }
      } else if (OutPt.poly2ContainsPoly1(outRec1.pointer, outRec2.pointer)) {
        outRec2.isHole = outRec1.isHole;
        outRec1.isHole = !outRec2.isHole;
        outRec2.left = outRec1.left;
        outRec1.left = outRec2;

        if (outRec1.checkArea(reverseSolution)) {
          outRec1.reverse();
        }
      } else {
        outRec2.isHole = outRec1.isHole;
        outRec2.left = outRec1.left;
      }
    } else {
      outRec2.pointer = null;
      outRec2.cleanBottom();
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
    let tmpEdge: TEdge = edge.ael.prev;

    while (tmpEdge !== null) {
      if (tmpEdge.isValid) {
        isHole = !isHole;
        if (outRec.left === null) outRec.left = this._data[tmpEdge.index];
      }
      tmpEdge = tmpEdge.ael.prev;
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
