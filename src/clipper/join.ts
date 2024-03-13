import IntPoint from "./int-point";
import OutPt from "./out-pt";
import OutRec from "./out-rec";

export default class Join {
  public OutPt1: OutPt;
  public OutPt2: OutPt;
  public OffPt: IntPoint;

  constructor(
    outPt1: OutPt = null,
    outPt2: OutPt = null,
    point: IntPoint = null
  ) {
    this.OutPt1 = outPt1;
    this.OutPt2 = outPt2;
    this.OffPt = point !== null ? IntPoint.from(point) : new IntPoint();
  }

  public joinPoints(
    outRec1: OutRec,
    outRec2: OutRec,
    isUseFullRange: boolean
  ): boolean {
    let op1: OutPt = this.OutPt1;
    let op2: OutPt = this.OutPt2;
    let op1b: OutPt = new OutPt();
    let op2b: OutPt = new OutPt();
    //There are 3 kinds of joins for output polygons ...
    //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
    //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
    //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
    //location at the Bottom of the overlapping segment (& Join.OffPt is above).
    //3. StrictlySimple joins where edges touch but are not collinear and where
    //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
    const isHorizontal: boolean = this.OutPt1.Pt.Y == this.OffPt.Y;

    if (
      isHorizontal &&
      this.OffPt.equal(this.OutPt1.Pt) &&
      this.OffPt.equal(this.OutPt2.Pt)
    ) {
      //Strictly Simple join ...
      op1b = this.OutPt1.Next;

      while (op1b != op1 && this.OffPt.equal(op1b.Pt)) {
        op1b = op1b.Next;
      }

      const reverse1: boolean = op1b.Pt.Y > this.OffPt.Y;

      op2b = this.OutPt2.Next;

      while (op2b != op2 && this.OffPt.equal(op2b.Pt)) {
        op2b = op2b.Next;
      }

      const reverse2: boolean = op2b.Pt.Y > this.OffPt.Y;

      if (reverse1 == reverse2) {
        return false;
      }

      op1b = op1.duplicate(!reverse1);
      op2b = op2.duplicate(reverse1);

      Join._updatePointerDeps(op1, op2, op1b, op2b, reverse1);

      this.OutPt1 = op1;
      this.OutPt2 = op1b;

      return true;
    }

    if (isHorizontal) {
      //treat horizontal joins differently to non-horizontal joins since with
      //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
      //may be anywhere along the horizontal edge.
      op1b = op1;

      while (op1.Prev.Pt.Y == op1.Pt.Y && op1.Prev != op1b && op1.Prev != op2) {
        op1 = op1.Prev;
      }
      while (
        op1b.Next.Pt.Y == op1b.Pt.Y &&
        op1b.Next != op1 &&
        op1b.Next != op2
      ) {
        op1b = op1b.Next;
      }
      if (op1b.Next == op1 || op1b.Next == op2) {
        return false;
      }
      //a flat 'polygon'
      op2b = op2;

      while (
        op2.Prev.Pt.Y == op2.Pt.Y &&
        op2.Prev != op2b &&
        op2.Prev != op1b
      ) {
        op2 = op2.Prev;
      }
      while (
        op2b.Next.Pt.Y == op2b.Pt.Y &&
        op2b.Next != op2 &&
        op2b.Next != op1
      ) {
        op2b = op2b.Next;
      }

      if (op2b.Next === op2 || op2b.Next === op1) {
        return false;
      }
      //a flat 'polygon'
      //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

      const overlap: number[] = Join._getOverlap(
        op1.Pt.X,
        op1b.Pt.X,
        op2.Pt.X,
        op2b.Pt.X
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

      if (op1.Pt.X >= left && op1.Pt.X <= right) {
        //Pt = op1.Pt;
        point.set(op1.Pt);
        isDiscardLeftSide = op1.Pt.X > op1b.Pt.X;
      } else if (op2.Pt.X >= left && op2.Pt.X <= right) {
        //Pt = op2.Pt;
        point.set(op2.Pt);
        isDiscardLeftSide = op2.Pt.X > op2b.Pt.X;
      } else if (op1b.Pt.X >= left && op1b.Pt.X <= right) {
        //Pt = op1b.Pt;
        point.set(op1b.Pt);
        isDiscardLeftSide = op1b.Pt.X > op1.Pt.X;
      } else {
        //Pt = op2b.Pt;
        point.set(op2b.Pt);
        isDiscardLeftSide = op2b.Pt.X > op2.Pt.X;
      }

      this.OutPt1 = op1;
      this.OutPt2 = op2;

      return Join._joinHorz(op1, op1b, op2, op2b, point, isDiscardLeftSide);
    }

    //nb: For non-horizontal joins ...
    //    1. Jr.OutPt1.Pt.Y == Jr.OutPt2.Pt.Y
    //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
    //make sure the polygons are correctly oriented ...
    op1b = op1.Next;

    while (op1.Pt.equal(op1b.Pt) && op1b !== op1) {
      op1b = op1b.Next;
    }

    const reverse1: boolean =
      op1b.Pt.Y > op1.Pt.Y ||
      !IntPoint.slopesEqual(op1.Pt, op1b.Pt, this.OffPt, isUseFullRange);

    if (reverse1) {
      op1b = op1.Prev;
      while (op1.Pt.equal(op1b.Pt) && op1b !== op1) {
        op1b = op1b.Prev;
      }

      if (
        op1b.Pt.Y > op1.Pt.Y ||
        !IntPoint.slopesEqual(op1.Pt, op1b.Pt, this.OffPt, isUseFullRange)
      )
        return false;
    }

    op2b = op2.Next;

    while (op2.Pt.equal(op2b.Pt) && op2b !== op2) {
      op2b = op2b.Next;
    }

    const reverse2: boolean =
      op2b.Pt.Y > op2.Pt.Y ||
      !IntPoint.slopesEqual(op2.Pt, op2b.Pt, this.OffPt, isUseFullRange);

    if (reverse2) {
      op2b = op2.Prev;

      while (op2.Pt.equal(op2b.Pt) && op2b !== op2) {
        op2b = op2b.Prev;
      }

      if (
        op2b.Pt.Y > op2.Pt.Y ||
        !IntPoint.slopesEqual(op2.Pt, op2b.Pt, this.OffPt, isUseFullRange)
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

    this.OutPt1 = op1;
    this.OutPt2 = op1b;

    return true;
  }

  private static _updatePointerDeps(
    op1: OutPt,
    op2: OutPt,
    op1b: OutPt,
    op2b: OutPt,
    reverse: boolean
  ): void {
    if (reverse) {
      op1.Prev = op2;
      op2.Next = op1;
      op1b.Next = op2b;
      op2b.Prev = op1b;
    } else {
      op1.Next = op2;
      op2.Prev = op1;
      op1b.Prev = op2b;
      op2b.Next = op1b;
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
    if (op1.Pt.X > op1b.Pt.X === op2.Pt.X > op2b.Pt.X) {
      return false;
    }
    //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
    //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
    //So, to facilitate this while inserting Op1b and Op2b ...
    //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
    //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
    let pointers: OutPt[];
    const reverse: boolean = op1.Pt.X <= op1b.Pt.X === isDiscardLeft;

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
    let nextPoint: IntPoint = primaryPtr.Next.Pt;

    while (
      nextPoint.X <= point.X &&
      nextPoint.X >= primaryPtr.Pt.X &&
      nextPoint.Y == point.Y
    ) {
      primaryPtr = primaryPtr.Next;
      nextPoint = primaryPtr.Next.Pt;
    }

    if (isDiscardLeft && primaryPtr.Pt.X != point.X) {
      primaryPtr = primaryPtr.Next;
    }

    let secondaryPtr: OutPt = primaryPtr.duplicate(!isDiscardLeft);

    if (IntPoint.unequal(secondaryPtr.Pt, point)) {
      primaryPtr = secondaryPtr;
      //op2.Pt = Pt;
      primaryPtr.Pt.set(point);
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
