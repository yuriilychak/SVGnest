import IntPoint from "./int-point";
import OutPt from "./out-pt";
import OutRec from "./out-rec";

export default class Join {
  private _pointer1: OutPt;
  private _pointer2: OutPt;
  private _point: IntPoint;

  constructor(
    outPt1: OutPt = null,
    outPt2: OutPt = null,
    point: IntPoint = null
  ) {
    this._pointer1 = outPt1;
    this._pointer2 = outPt2;
    this._point = point !== null ? IntPoint.from(point) : new IntPoint();
  }

  public joinPoints(
    outRec1: OutRec,
    outRec2: OutRec,
    isUseFullRange: boolean
  ): boolean {
    let op1: OutPt = this._pointer1;
    let op2: OutPt = this._pointer2;
    let op1b: OutPt = new OutPt();
    let op2b: OutPt = new OutPt();
    const isHorizontal: boolean = this._pointer1.point.y == this._point.y;

    if (
      isHorizontal &&
      this._point.equal(this._pointer1.point) &&
      this._point.equal(this._pointer2.point)
    ) {
      op1b = this._pointer1.next;

      while (op1b != op1 && this._point.equal(op1b.point)) {
        op1b = op1b.next;
      }

      const reverse1: boolean = op1b.point.y > this._point.y;

      op2b = this._pointer2.next;

      while (op2b != op2 && this._point.equal(op2b.point)) {
        op2b = op2b.next;
      }

      const reverse2: boolean = op2b.point.y > this._point.y;

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
        op1.prev.point.y == op1.point.y &&
        op1.prev != op1b &&
        op1.prev != op2
      ) {
        op1 = op1.prev;
      }

      while (
        op1b.next.point.y == op1b.point.y &&
        op1b.next != op1 &&
        op1b.next != op2
      ) {
        op1b = op1b.next;
      }

      if (op1b.next == op1 || op1b.next == op2) {
        return false;
      }
      //a flat 'polygon'
      op2b = op2;

      while (
        op2.prev.point.y == op2.point.y &&
        op2.prev != op2b &&
        op2.prev != op1b
      ) {
        op2 = op2.prev;
      }

      while (
        op2b.next.point.y == op2b.point.y &&
        op2b.next != op2 &&
        op2b.next != op1
      ) {
        op2b = op2b.next;
      }

      if (op2b.next === op2 || op2b.next === op1) {
        return false;
      }
      //a flat 'polygon'
      //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

      const overlap: number[] = Join._getOverlap(
        op1.point.x,
        op1b.point.x,
        op2.point.x,
        op2b.point.x
      );

      const left: number = overlap[0];
      const right: number = overlap[1];

      if (left >= right) {
        return false;
      }

      //DiscardLeftSide: when overlapping edges are joined, a spike will created
      //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
      //on the discard Side as either may still be needed for other joins ...
      const point: IntPoint = new IntPoint();
      let isDiscardLeftSide: boolean;

      if (op1.point.x >= left && op1.point.x <= right) {
        //Pt = op1.Pt;
        point.set(op1.point);
        isDiscardLeftSide = op1.point.x > op1b.point.x;
      } else if (op2.point.x >= left && op2.point.x <= right) {
        //Pt = op2.Pt;
        point.set(op2.point);
        isDiscardLeftSide = op2.point.x > op2b.point.x;
      } else if (op1b.point.x >= left && op1b.point.x <= right) {
        //Pt = op1b.Pt;
        point.set(op1b.point);
        isDiscardLeftSide = op1b.point.x > op1.point.x;
      } else {
        //Pt = op2b.Pt;
        point.set(op2b.point);
        isDiscardLeftSide = op2b.point.x > op2.point.x;
      }

      this._pointer1 = op1;
      this._pointer2 = op2;

      return Join._joinHorz(op1, op1b, op2, op2b, point, isDiscardLeftSide);
    }

    op1b = op1.next;

    while (op1.point.equal(op1b.point) && op1b !== op1) {
      op1b = op1b.next;
    }

    const reverse1: boolean =
      op1b.point.y > op1.point.y ||
      !IntPoint.slopesEqual(op1.point, op1b.point, this._point, isUseFullRange);

    if (reverse1) {
      op1b = op1.prev;

      while (op1.point.equal(op1b.point) && op1b !== op1) {
        op1b = op1b.prev;
      }

      if (
        op1b.point.y > op1.point.y ||
        !IntPoint.slopesEqual(
          op1.point,
          op1b.point,
          this._point,
          isUseFullRange
        )
      )
        return false;
    }

    op2b = op2.next;

    while (op2.point.equal(op2b.point) && op2b !== op2) {
      op2b = op2b.next;
    }

    const reverse2: boolean =
      op2b.point.y > op2.point.y ||
      !IntPoint.slopesEqual(op2.point, op2b.point, this._point, isUseFullRange);

    if (reverse2) {
      op2b = op2.prev;

      while (op2.point.equal(op2b.point) && op2b !== op2) {
        op2b = op2b.prev;
      }

      if (
        op2b.point.y > op2.point.y ||
        !IntPoint.slopesEqual(
          op2.point,
          op2b.point,
          this._point,
          isUseFullRange
        )
      ) {
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

  public get pointer1(): OutPt {
    return this._pointer1;
  }

  public get pointer2(): OutPt {
    return this._pointer2;
  }

  public get point(): IntPoint {
    return this._point;
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
    point: IntPoint,
    isDiscardLeft: boolean
  ): boolean {
    if (op1.point.x > op1b.point.x === op2.point.x > op2b.point.x) {
      return false;
    }
    //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
    //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
    //So, to facilitate this while inserting Op1b and Op2b ...
    //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
    //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
    let pointers: OutPt[];
    const reverse: boolean = op1.point.x <= op1b.point.x === isDiscardLeft;

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
    point: IntPoint,
    isDiscardLeft: boolean
  ): OutPt[] {
    let primaryPtr: OutPt = inputPtr;
    let nextPoint: IntPoint = primaryPtr.next.point;

    while (
      nextPoint.x <= point.x &&
      nextPoint.x >= primaryPtr.point.x &&
      nextPoint.y == point.y
    ) {
      primaryPtr = primaryPtr.next;
      nextPoint = primaryPtr.next.point;
    }

    if (isDiscardLeft && primaryPtr.point.x != point.x) {
      primaryPtr = primaryPtr.next;
    }

    let secondaryPtr: OutPt = primaryPtr.duplicate(!isDiscardLeft);

    if (IntPoint.unequal(secondaryPtr.point, point)) {
      primaryPtr = secondaryPtr;
      primaryPtr.point.set(point);
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
