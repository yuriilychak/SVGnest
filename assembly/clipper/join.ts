import { Point } from "../geom";
import OutPt from "./out-pt";
import OutRec from "./out-rec";

export default class Join extends Point {
  private _pointer1: OutPt | null;
  private _pointer2: OutPt | null;

  constructor(
    outPt1: OutPt | null = null,
    outPt2: OutPt | null = null,
    point: Point | null = null
  ) {
    super();
    this._pointer1 = outPt1;
    this._pointer2 = outPt2;

    if (point !== null) {
      this.set(point);
    }
  }

  public joinPoints(outRec1: OutRec, outRec2: OutRec): boolean {
    let outPt1a: OutPt = this._pointer1 as OutPt;
    let outPt2a: OutPt = this._pointer2 as OutPt;
    let outPt1b: OutPt = new OutPt();
    let outPt2b: OutPt = new OutPt();
    const isHorizontal: boolean = outPt1a.y == this.y;

    if (
      isHorizontal &&
      this.equal(this._pointer1) &&
      this.equal(this._pointer2)
    ) {
      outPt1b = (this._pointer1 as OutPt).next as OutPt;

      while (outPt1b != outPt1a && this.equal(outPt1b)) {
        outPt1b = outPt1b.next as OutPt;
      }

      const reverse1: boolean = outPt1b.y > this.y;

      outPt2b = (this._pointer2 as OutPt).next as OutPt;

      while (outPt2b != outPt2a && this.equal(outPt2b)) {
        outPt2b = outPt2b.next as OutPt;
      }

      const reverse2: boolean = outPt2b.y > this.y;

      if (reverse1 == reverse2) {
        return false;
      }

      outPt1b = outPt1a.duplicate(!reverse1);
      outPt2b = outPt2a.duplicate(reverse1);

      Join._updatePointerDeps(outPt1a, outPt2a, outPt1b, outPt2b, reverse1);

      this._pointer1 = outPt1a;
      this._pointer2 = outPt1b;

      return true;
    }

    if (isHorizontal) {
      outPt1b = outPt1a;

      while (
        outPt1a.prev !== null &&
        outPt1a.prev.y == outPt1a.y &&
        outPt1a.prev != outPt1b &&
        outPt1a.prev != outPt2a
      ) {
        outPt1a = outPt1a.prev;
      }

      while (
        outPt1b.next !== null &&
        outPt1b.next.y == outPt1b.y &&
        outPt1b.next != outPt1a &&
        outPt1b.next != outPt2a
      ) {
        outPt1b = outPt1b.next;
      }

      if (outPt1b.next == outPt1a || outPt1b.next == outPt2a) {
        return false;
      }
      //a flat 'polygon'
      outPt2b = outPt2a;

      while (
        outPt2a.prev !== null &&
        outPt2a.prev.y == outPt2a.y &&
        outPt2a.prev != outPt2b &&
        outPt2a.prev != outPt1b
      ) {
        outPt2a = outPt2a.prev;
      }

      while (
        outPt2b.next !== null &&
        outPt2b.next.y == outPt2b.y &&
        outPt2b.next != outPt2a &&
        outPt2b.next != outPt1a
      ) {
        outPt2b = outPt2b.next;
      }

      if (outPt2b.next === outPt2a || outPt2b.next === outPt1a) {
        return false;
      }
      //a flat 'polygon'
      //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

      const overlap: f64[] = Join._getOverlap(
        outPt1a.x,
        outPt1b.x,
        outPt2a.x,
        outPt2b.x
      );

      const left: f64 = overlap[0];
      const right: f64 = overlap[1];

      if (left >= right) {
        return false;
      }

      //DiscardLeftSide: when overlapping edges are joined, a spike will created
      //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
      //on the discard Side as either may still be needed for other joins ...
      const point: Point = Point.empty();
      let isDiscardLeftSide: boolean;

      if (outPt1a.x >= left && outPt1a.x <= right) {
        //Pt = op1.Pt;
        point.set(outPt1a);
        isDiscardLeftSide = outPt1a.x > outPt1b.x;
      } else if (outPt2a.x >= left && outPt2a.x <= right) {
        //Pt = op2.Pt;
        point.set(outPt2a);
        isDiscardLeftSide = outPt2a.x > outPt2b.x;
      } else if (outPt1b.x >= left && outPt1b.x <= right) {
        //Pt = op1b.Pt;
        point.set(outPt1b);
        isDiscardLeftSide = outPt1b.x > outPt1a.x;
      } else {
        //Pt = op2b.Pt;
        point.set(outPt2b);
        isDiscardLeftSide = outPt2b.x > outPt2a.x;
      }

      this._pointer1 = outPt1a;
      this._pointer2 = outPt2a;

      return Join._joinHorz(
        outPt1a,
        outPt1b,
        outPt2a,
        outPt2b,
        point,
        isDiscardLeftSide
      );
    }

    outPt1b = outPt1a.next as OutPt;

    while (outPt1a.equal(outPt1b) && outPt1b !== outPt1a) {
      outPt1b = outPt1b.next as OutPt;
    }

    const reverse1: boolean =
      outPt1b.y > outPt1a.y || !Point.slopesEqual(outPt1a, outPt1b, this);

    if (reverse1) {
      outPt1b = outPt1a.prev as OutPt;

      while (outPt1a.equal(outPt1b) && outPt1b !== outPt1a) {
        outPt1b = outPt1b.prev as OutPt;
      }

      if (outPt1b.y > outPt1a.y || !Point.slopesEqual(outPt1a, outPt1b, this))
        return false;
    }

    outPt2b = outPt2a.next as OutPt;

    while (outPt2a.equal(outPt2b) && outPt2b !== outPt2a) {
      outPt2b = outPt2b.next as OutPt;
    }

    const reverse2: boolean =
      outPt2b.y > outPt2a.y || !Point.slopesEqual(outPt2a, outPt2b, this);

    if (reverse2) {
      outPt2b = outPt2a.prev as OutPt;

      while (outPt2a.equal(outPt2b) && outPt2b !== outPt2a) {
        outPt2b = outPt2b.prev as OutPt;
      }

      if (outPt2b.y > outPt2a.y || !Point.slopesEqual(outPt2a, outPt2b, this)) {
        return false;
      }
    }

    if (
      outPt1b == outPt1a ||
      outPt2b == outPt2a ||
      outPt1b == outPt2b ||
      (outRec1 == outRec2 && reverse1 == reverse2)
    ) {
      return false;
    }

    outPt1b = outPt1a.duplicate(!reverse1);
    outPt2b = outPt2a.duplicate(reverse1);

    Join._updatePointerDeps(outPt1a, outPt2a, outPt1b, outPt2b, reverse1);

    this._pointer1 = outPt1a;
    this._pointer2 = outPt1b;

    return true;
  }

  public get pointer1(): OutPt | null {
    return this._pointer1;
  }

  public get pointer2(): OutPt | null {
    return this._pointer2;
  }

  private static _updatePointerDeps(
    op1: OutPt,
    op2: OutPt,
    op1b: OutPt,
    op2b: OutPt,
    reverse: boolean
  ): void {
    if (reverse) {
      op1.prev = op2;
      op2.next = op1;
      op1b.next = op2b;
      op2b.prev = op1b;
    } else {
      op1.next = op2;
      op2.prev = op1;
      op1b.prev = op2b;
      op2b.next = op1b;
    }
  }

  private static _joinHorz(
    op1: OutPt,
    op1b: OutPt,
    op2: OutPt,
    op2b: OutPt,
    point: Point,
    isDiscardLeft: boolean
  ): boolean {
    if (op1.x > op1b.x === op2.x > op2b.x) {
      return false;
    }
    //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
    //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
    //So, to facilitate this while inserting Op1b and Op2b ...
    //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
    //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
    let pointers: OutPt[];
    const reverse: boolean = op1.x <= op1b.x === isDiscardLeft;

    pointers = Join._updatePointers(op1, point, reverse);

    op1 = pointers[0];
    op1b = pointers[1];

    pointers = Join._updatePointers(op2, point, !reverse);

    op2 = pointers[0];
    op2b = pointers[1];

    Join._updatePointerDeps(op1, op2, op1b, op2b, reverse);

    return true;
  }

  private static _updatePointers(
    inputPtr: OutPt,
    point: Point,
    isDiscardLeft: boolean
  ): OutPt[] {
    let primaryPtr: OutPt = inputPtr;
    let nextPoint: Point = primaryPtr.next as Point;

    while (
      nextPoint.x <= point.x &&
      nextPoint.x >= primaryPtr.x &&
      nextPoint.y == point.y
    ) {
      primaryPtr = primaryPtr.next as OutPt;
      nextPoint = primaryPtr.next as Point;
    }

    if (isDiscardLeft && primaryPtr.x != point.x) {
      primaryPtr = primaryPtr.next as OutPt;
    }

    let secondaryPtr: OutPt = primaryPtr.duplicate(!isDiscardLeft);

    if (!point.equal(secondaryPtr)) {
      primaryPtr = secondaryPtr;
      primaryPtr.set(point);
      secondaryPtr = primaryPtr.duplicate(!isDiscardLeft);
    }

    return [primaryPtr, secondaryPtr];
  }

  private static _getOverlap(a1: f64, a2: f64, b1: f64, b2: f64): f64[] {
    return [
      Math.max(Math.min(a1, a2), Math.min(b1, b2)),
      Math.min(Math.max(a2, a1), Math.max(b2, b1))
    ];
  }
}
