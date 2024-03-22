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
    let op1: OutPt = this._pointer1 as OutPt;
    let op2: OutPt = this._pointer2 as OutPt;
    let op1b: OutPt = new OutPt();
    let op2b: OutPt = new OutPt();
    const isHorizontal: boolean = op1.y == this.y;

    if (isHorizontal && this.equal(op1) && this.equal(op2)) {
      op1b = op1.source.unsafeNext;

      while (op1b != op1 && this.equal(op1b)) {
        op1b = op1b.source.unsafeNext;
      }

      const reverse1: boolean = op1b.y > this.y;

      op2b = op2.source.unsafeNext;

      while (op2b != op2 && this.equal(op2b)) {
        op2b = op2b.source.unsafeNext;
      }

      const reverse2: boolean = op2b.y > this.y;

      if (reverse1 == reverse2) {
        return false;
      }

      op1b = op1.duplicate(!reverse1);
      op2b = op2.duplicate(reverse1);

      Join._updatePointerDeps(op1, op2, op1b, op2b, reverse1);

      this._pointer1 = op1;
      this._pointer2 = op1b;

      return true;
    }

    if (isHorizontal) {
      op1b = op1;

      while (
        op1.source.unsafePev.y == op1.y &&
        op1.source.unsafePev != op1b &&
        op1.source.unsafePev != op2
      ) {
        op1 = op1.source.unsafePev;
      }

      while (
        op1b.source.unsafeNext.y == op1b.y &&
        op1b.source.unsafeNext != op1 &&
        op1b.source.unsafeNext != op2
      ) {
        op1b = op1b.source.unsafeNext;
      }

      if (op1b.source.unsafeNext == op1 || op1b.source.unsafeNext == op2) {
        return false;
      }
      //a flat 'polygon'
      op2b = op2;

      while (
        op2.source.unsafePev.y == op2.y &&
        op2.source.unsafePev != op2b &&
        op2.source.unsafePev != op1b
      ) {
        op2 = op2.source.unsafePev;
      }

      while (
        op2b.source.unsafeNext.y == op2b.y &&
        op2b.source.unsafeNext != op2 &&
        op2b.source.unsafeNext != op1
      ) {
        op2b = op2b.source.unsafeNext;
      }

      if (op2b.source.unsafeNext === op2 || op2b.source.unsafeNext === op1) {
        return false;
      }
      //a flat 'polygon'
      //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

      const overlap: number[] = Join._getOverlap(op1.x, op1b.x, op2.x, op2b.x);

      const left: number = overlap[0];
      const right: number = overlap[1];

      if (left >= right) {
        return false;
      }

      //DiscardLeftSide: when overlapping edges are joined, a spike will created
      //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
      //on the discard Side as either may still be needed for other joins ...
      const point: Point = Point.empty();
      let isDiscardLeftSide: boolean;

      if (op1.x >= left && op1.x <= right) {
        //Pt = op1.Pt;
        point.set(op1);
        isDiscardLeftSide = op1.x > op1b.x;
      } else if (op2.x >= left && op2.x <= right) {
        //Pt = op2.Pt;
        point.set(op2);
        isDiscardLeftSide = op2.x > op2b.x;
      } else if (op1b.x >= left && op1b.x <= right) {
        //Pt = op1b.Pt;
        point.set(op1b);
        isDiscardLeftSide = op1b.x > op1.x;
      } else {
        //Pt = op2b.Pt;
        point.set(op2b);
        isDiscardLeftSide = op2b.x > op2.x;
      }

      this._pointer1 = op1;
      this._pointer2 = op2;

      return Join._joinHorz(op1, op1b, op2, op2b, point, isDiscardLeftSide);
    }

    op1b = op1.source.unsafeNext;

    while (op1.equal(op1b) && op1b !== op1) {
      op1b = op1b.source.unsafeNext;
    }

    const reverse1: boolean =
      op1b.y > op1.y || !Point.slopesEqual(op1, op1b, this);

    if (reverse1) {
      op1b = op1.source.unsafePev;

      while (op1.equal(op1b) && op1b !== op1) {
        op1b = op1b.source.unsafePev;
      }

      if (op1b.y > op1.y || !Point.slopesEqual(op1, op1b, this)) return false;
    }

    op2b = op2.source.unsafeNext;

    while (op2.equal(op2b) && op2b !== op2) {
      op2b = op2b.source.unsafeNext;
    }

    const reverse2: boolean =
      op2b.y > op2.y || !Point.slopesEqual(op2, op2b, this);

    if (reverse2) {
      op2b = op2.source.unsafePev;

      while (op2.equal(op2b) && op2b !== op2) {
        op2b = op2b.source.unsafePev;
      }

      if (op2b.y > op2.y || !Point.slopesEqual(op2, op2b, this)) {
        return false;
      }
    }

    if (
      op1b == op1 ||
      op2b == op2 ||
      op1b == op2b ||
      (outRec1 == outRec2 && reverse1 == reverse2)
    ) {
      return false;
    }

    op1b = op1.duplicate(!reverse1);
    op2b = op2.duplicate(reverse1);

    Join._updatePointerDeps(op1, op2, op1b, op2b, reverse1);

    this._pointer1 = op1;
    this._pointer2 = op1b;

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
      op1.source.prev = op2;
      op2.source.next = op1;
      op1b.source.next = op2b;
      op2b.source.prev = op1b;
    } else {
      op1.source.next = op2;
      op2.source.prev = op1;
      op1b.source.prev = op2b;
      op2b.source.next = op1b;
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
    let nextPoint: Point = primaryPtr.source.unsafeNext;

    while (
      nextPoint.x <= point.x &&
      nextPoint.x >= primaryPtr.x &&
      nextPoint.y == point.y
    ) {
      primaryPtr = primaryPtr.source.unsafeNext;
      nextPoint = primaryPtr.source.unsafeNext;
    }

    if (isDiscardLeft && primaryPtr.x != point.x) {
      primaryPtr = primaryPtr.source.unsafeNext;
    }

    let secondaryPtr: OutPt = primaryPtr.duplicate(!isDiscardLeft);

    if (!point.equal(secondaryPtr)) {
      primaryPtr = secondaryPtr;
      primaryPtr.set(point);
      secondaryPtr = primaryPtr.duplicate(!isDiscardLeft);
    }

    return [primaryPtr, secondaryPtr];
  }

  private static _getOverlap(
    a1: number,
    a2: number,
    b1: number,
    b2: number
  ): number[] {
    return [
      Math.max(Math.min(a1, a2), Math.min(b1, b2)),
      Math.min(Math.max(a2, a1), Math.max(b2, b1))
    ];
  }
}
