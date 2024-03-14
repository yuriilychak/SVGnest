import IntPoint from "./int-point";
import OutPt from "./out-pt";

export default class OutRec {
  public Idx: number = 0;
  public IsHole: boolean = false;
  public IsOpen: boolean = false;
  public FirstLeft: OutRec = null;
  public Pts: OutPt = null;
  public BottomPt: OutPt = null;
  public PolyNode: any = null;

  public updateOutPtIdxs(): void {
    let op: OutPt = this.Pts;

    do {
      op.Idx = this.Idx;
      op = op.Prev;
    } while (op !== this.Pts);
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
          (!preserveCollinear || !pp.Pt.isBetween(pp.Prev.Pt, pp.Next.Pt)))
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
}
