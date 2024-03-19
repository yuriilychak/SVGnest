import IntPoint from "./int-point";
import OutPt from "./out-pt";

export default class OutRec {
  public index: number;
  public isHole: boolean = false;
  public isOpen: boolean = false;
  public left: OutRec = null;
  public pointer: OutPt = null;
  private _bottom: OutPt = null;

  constructor(index: number = 0) {
    this.index = index;
  }

  public updateOutPtIdxs(): void {
    let op: OutPt = this.pointer;

    do {
      op.index = this.index;
      op = op.prev;
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
    this._bottom = null;
    let lastOutPt: OutPt = null;
    let outPt: OutPt = this.pointer;

    while (true) {
      if (outPt.prev == outPt || outPt.prev == outPt.next) {
        outPt.dispose();
        this.pointer = null;
        return;
      }
      //test for duplicate points and collinear edges ...
      if (
        outPt.point.equal(outPt.next.point) ||
        outPt.point.equal(outPt.prev.point) ||
        (IntPoint.slopesEqual(
          outPt.prev.point,
          outPt.point,
          outPt.next.point,
          useFullRange
        ) &&
          (!preserveCollinear ||
            !outPt.point.between(outPt.prev.point, outPt.next.point)))
      ) {
        lastOutPt = null;
        outPt.prev.next = outPt.next;
        outPt.next.prev = outPt.prev;
        outPt = outPt.prev;
      } else if (outPt == lastOutPt) {
        break;
      } else {
        if (lastOutPt === null) {
          lastOutPt = outPt;
        }
        outPt = outPt.next;
      }
    }
    this.pointer = outPt;
  }

  public cleanBottom(): void {
    this._bottom = null;
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
        (pointer.prev.point.x + pointer.point.x) *
          (pointer.prev.point.y - pointer.point.y);
      pointer = pointer.next;
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
    if (outRec1._bottom === null) {
      outRec1._bottom = outRec1.pointer.bottomPt;
    }

    if (outRec2._bottom === null) {
      outRec2._bottom = outRec2.pointer.bottomPt;
    }

    const pointer1: OutPt = outRec1._bottom;
    const pointer2: OutPt = outRec2._bottom;
    const offset: IntPoint = IntPoint.sub(pointer1.point, pointer2.point);

    switch (true) {
      case offset.y < 0:
        return outRec1;
      case offset.y > 0:
        return outRec2;
      case offset.x > 0:
        return outRec1;
      case offset.x < 0:
        return outRec2;
      case pointer1.next == pointer1:
        return outRec2;
      case pointer2.next == pointer2:
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
