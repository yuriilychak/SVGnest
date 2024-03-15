import IntPoint from "./int-point";
import OutPt from "./out-pt";

export default class OutRec {
  public Idx: number;
  public IsHole: boolean = false;
  public IsOpen: boolean = false;
  public FirstLeft: OutRec = null;
  public Pts: OutPt = null;
  public BottomPt: OutPt = null;
  public PolyNode: any = null;

  constructor(index: number = 0) {
    this.Idx = index;
  }

  public updateOutPtIdxs(): void {
    let op: OutPt = this.Pts;

    do {
      op.Idx = this.Idx;
      op = op.Prev;
    } while (op !== this.Pts);
  }

  public reverse(): void {
    if (this.Pts !== null) {
      this.Pts.reverse();
    }
  }

  public fixupOutPolygon(
    useFullRange: boolean,
    preserveCollinear: boolean
  ): void {
    //FixupOutPolygon() - removes duplicate points and simplifies consecutive
    //parallel edges by removing the middle vertex.
    var lastOK = null;
    this.BottomPt = null;
    var pp = this.Pts;
    for (;;) {
      if (pp.Prev == pp || pp.Prev == pp.Next) {
        pp.dispose();
        this.Pts = null;
        return;
      }
      //test for duplicate points and collinear edges ...
      if (
        pp.Pt.equal(pp.Next.Pt) ||
        pp.Pt.equal(pp.Prev.Pt) ||
        (IntPoint.slopesEqual(pp.Prev.Pt, pp.Pt, pp.Next.Pt, useFullRange) &&
          (!preserveCollinear || !pp.Pt.between(pp.Prev.Pt, pp.Next.Pt)))
      ) {
        lastOK = null;
        pp.Prev.Next = pp.Next;
        pp.Next.Prev = pp.Prev;
        pp = pp.Prev;
      } else if (pp == lastOK) break;
      else {
        if (lastOK === null) lastOK = pp;
        pp = pp.Next;
      }
    }
    this.Pts = pp;
  }

  public get area(): number {
    let pointer: OutPt = this.Pts;

    if (pointer == null) {
      return 0;
    }

    let result: number = 0;

    do {
      result =
        result +
        (pointer.Prev.Pt.X + pointer.Pt.X) * (pointer.Prev.Pt.Y - pointer.Pt.Y);
      pointer = pointer.Next;
    } while (pointer != this.Pts);
    return result * 0.5;
  }

  public static param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
    do {
      outRec1 = outRec1.FirstLeft;
      if (outRec1 == outRec2) return true;
    } while (outRec1 !== null);
    return false;
  }

  public static parseFirstLeft(FirstLeft: OutRec): OutRec {
    while (FirstLeft != null && FirstLeft.Pts == null)
      FirstLeft = FirstLeft.FirstLeft;
    return FirstLeft;
  }

  public static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
    //work out which polygon fragment has the correct hole state ...
    if (outRec1.BottomPt === null) outRec1.BottomPt = outRec1.Pts.bottomPt;
    if (outRec2.BottomPt === null) outRec2.BottomPt = outRec2.Pts.bottomPt;
    var bPt1 = outRec1.BottomPt;
    var bPt2 = outRec2.BottomPt;
    if (bPt1.Pt.Y > bPt2.Pt.Y) return outRec1;
    else if (bPt1.Pt.Y < bPt2.Pt.Y) return outRec2;
    else if (bPt1.Pt.X < bPt2.Pt.X) return outRec1;
    else if (bPt1.Pt.X > bPt2.Pt.X) return outRec2;
    else if (bPt1.Next == bPt1) return outRec2;
    else if (bPt2.Next == bPt2) return outRec1;
    else if (OutPt.firstIsBottomPt(bPt1, bPt2)) return outRec1;
    else return outRec2;
  }

  public static getHoleStartRec(outRec1: OutRec, outRec2: OutRec): OutRec {
    if (outRec1 === outRec2) {
      return outRec1;
    }
    if (OutRec.param1RightOfParam2(outRec1, outRec2)) {
      return outRec2;
    }
    if (OutRec.param1RightOfParam2(outRec2, outRec1)) {
      return outRec1;
    }
    return OutRec.getLowermostRec(outRec1, outRec2);
  }
}
