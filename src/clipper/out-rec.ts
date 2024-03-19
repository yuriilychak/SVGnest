import IntPoint from "./int-point";
import OutPt from "./out-pt";
import PolyNode from "./poly-node";

export default class OutRec {
  public index: number;
  public isHole: boolean = false;
  public isOpen: boolean = false;
  public left: OutRec = null;
  public pointer: OutPt = null;
  public bottom: OutPt = null;
  public node: PolyNode = null;

  constructor(index: number = 0) {
    this.index = index;
  }

  public updateOutPtIdxs(): void {
    let op: OutPt = this.pointer;

    do {
      op.Idx = this.index;
      op = op.Prev;
    } while (op !== this.pointer);
  }

  public reverse(): void {
    if (this.pointer !== null) {
      this.pointer.reverse();
    }
  }

  //FixupOutPolygon() - removes duplicate points and simplifies consecutive
  //parallel edges by removing the middle vertex.
  public fixupOutPolygon(
    useFullRange: boolean,
    preserveCollinear: boolean
  ): void {
    this.bottom = null;
    let lastOutPt: OutPt = null;
    let outPt: OutPt = this.pointer;

    while (true) {
      if (outPt.Prev == outPt || outPt.Prev == outPt.Next) {
        outPt.dispose();
        this.pointer = null;
        return;
      }
      //test for duplicate points and collinear edges ...
      if (
        outPt.Pt.equal(outPt.Next.Pt) ||
        outPt.Pt.equal(outPt.Prev.Pt) ||
        (IntPoint.slopesEqual(
          outPt.Prev.Pt,
          outPt.Pt,
          outPt.Next.Pt,
          useFullRange
        ) &&
          (!preserveCollinear ||
            !outPt.Pt.between(outPt.Prev.Pt, outPt.Next.Pt)))
      ) {
        lastOutPt = null;
        outPt.Prev.Next = outPt.Next;
        outPt.Next.Prev = outPt.Prev;
        outPt = outPt.Prev;
      } else if (outPt == lastOutPt) {
        break;
      } else {
        if (lastOutPt === null) {
          lastOutPt = outPt;
        }
        outPt = outPt.Next;
      }
    }
    this.pointer = outPt;
  }

  public get area(): number {
    let pointer: OutPt = this.pointer;

    if (pointer == null) {
      return 0;
    }

    let result: number = 0;

    do {
      result =
        result +
        (pointer.Prev.Pt.X + pointer.Pt.X) * (pointer.Prev.Pt.Y - pointer.Pt.Y);
      pointer = pointer.Next;
    } while (pointer != this.pointer);

    return result * 0.5;
  }

  public static param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
    do {
      outRec1 = outRec1.left;

      if (outRec1 == outRec2) {
        return true;
      }
    } while (outRec1 !== null);

    return false;
  }

  //work out which polygon fragment has the correct hole state ...
  public static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
    if (outRec1.bottom === null) {
      outRec1.bottom = outRec1.pointer.bottomPt;
    }

    if (outRec2.bottom === null) {
      outRec2.bottom = outRec2.pointer.bottomPt;
    }

    const pointer1: OutPt = outRec1.bottom;
    const pointer2: OutPt = outRec2.bottom;
    const offset: IntPoint = IntPoint.sub(pointer1.Pt, pointer2.Pt);

    switch (true) {
      case offset.Y < 0:
        return outRec1;
      case offset.Y > 0:
        return outRec2;
      case offset.X > 0:
        return outRec1;
      case offset.X < 0:
        return outRec2;
      case pointer1.Next == pointer1:
        return outRec2;
      case pointer2.Next == pointer2:
        return outRec1;
      case OutPt.firstIsBottomPt(pointer1, pointer2):
        return outRec1;
      default:
        return outRec2;
    }
  }

  public static getHoleStartRec(outRec1: OutRec, outRec2: OutRec): OutRec {
    switch (true) {
      case outRec1 === outRec2:
        return outRec1;
      case OutRec.param1RightOfParam2(outRec1, outRec2):
        return outRec2;
      case OutRec.param1RightOfParam2(outRec2, outRec1):
        return outRec1;
      default:
        return OutRec.getLowermostRec(outRec1, outRec2);
    }
  }
}
