import { Point } from "../geom";
import OutPt from "./out-pt";

export default class OutRec {
  public index: i16;
  public isHole: boolean = false;
  public isOpen: boolean = false;
  public left: OutRec | null = null;
  public pointer: OutPt | null = null;
  private _bottom: OutPt | null = null;

  constructor(index: u16 = 0) {
    this.index = index;
  }

  public updateOutPtIdxs(): void {
    let outPt: OutPt | null = this.pointer;

    if (outPt === null) {
      return;
    }

    do {
      outPt.index = this.index;
      outPt = outPt.prev as OutPt;
    } while (outPt !== this.pointer);
  }

  public reverse(): void {
    if (this.pointer !== null) {
      this.pointer.reversePointer();
    }
  }

  //FixupOutPolygon() - removes duplicate points and simplifies consecutive
  //parallel edges by removing the middle vertex.
  public fixupOutPolygon(preserveCollinear: boolean): void {
    this._bottom = null;
    let lastOutPt: OutPt | null = null;
    let outPt: OutPt | null = this.pointer;

    while (true) {
      if (outPt === null) {
        break;
      }

      if (outPt.prev == outPt || outPt.isLooped) {
        outPt.dispose();
        this.pointer = null;

        return;
      }
      //test for duplicate points and collinear edges ...
      if (
        outPt.equal(outPt.next) ||
        outPt.equal(outPt.prev) ||
        (Point.slopesEqual(outPt.prev, outPt, outPt.next) &&
          (!preserveCollinear || !outPt.between(outPt.prev, outPt.next)))
      ) {
        lastOutPt = null;
        (outPt.prev as OutPt).next = outPt.next;
        (outPt.next as OutPt).prev = outPt.prev;
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

  public checkArea(reverseSolution: boolean): boolean {
    return (this.isHole !== reverseSolution) === this.area > 0;
  }

  public get area(): f64 {
    let pointer: OutPt | null = this.pointer;

    if (pointer == null) {
      return 0;
    }

    let result: f64 = 0;

    do {
      result =
        result +
        ((pointer.prev as OutPt).x + pointer.x) *
          ((pointer.prev as OutPt).y - pointer.y);
      pointer = pointer.next as OutPt;
    } while (pointer !== this.pointer);

    return result * 0.5;
  }

  public get hasPointer(): boolean {
    return this.pointer !== null;
  }

  public static param1RightOfParam2(
    outRec1: OutRec | null,
    outRec2: OutRec
  ): boolean {
    do {
      outRec1 = (outRec1 as OutRec).left;

      if (outRec1 === outRec2) {
        return true;
      }
    } while (outRec1 !== null);

    return false;
  }

  //work out which polygon fragment has the correct hole state ...
  public static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
    if (outRec1._bottom === null && outRec1.pointer !== null) {
      outRec1._bottom = outRec1.pointer.bottomPt;
    }

    if (outRec2._bottom === null && outRec2.pointer !== null) {
      outRec2._bottom = outRec2.pointer.bottomPt;
    }

    const pointer1: OutPt = outRec1._bottom as OutPt;
    const pointer2: OutPt = outRec2._bottom as OutPt;
    const offset: Point = Point.sub(pointer1, pointer2);

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
