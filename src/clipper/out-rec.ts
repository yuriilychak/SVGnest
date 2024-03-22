import { Point } from "../geom";
import OutPt from "./out-pt";

export default class OutRec {
  public index: number;
  public isHole: boolean = false;
  public isOpen: boolean = false;
  public left: OutRec | null = null;
  public pointer: OutPt | null = null;
  private _bottom: OutPt | null = null;

  constructor(index: number = 0) {
    this.index = index;
  }

  public updateOutPtIdxs(): void {
    if (this.pointer === null) {
      return;
    }

    let outPt: OutPt = this.pointer;

    do {
      outPt.index = this.index;
      outPt = outPt.source.unsafePev;
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

    if (this.pointer === null) {
      return;
    }

    let lastOutPt: OutPt | null = null;
    let outPt: OutPt = this.pointer;

    while (true) {
      if (outPt.source.prev == outPt || outPt.source.isLooped) {
        outPt.dispose();
        this.pointer = null;

        return;
      }
      //test for duplicate points and collinear edges ...
      if (
        outPt.equal(outPt.source.unsafeNext) ||
        outPt.equal(outPt.source.unsafePev) ||
        (Point.slopesEqual(
          outPt.source.unsafePev,
          outPt,
          outPt.source.unsafeNext
        ) &&
          (!preserveCollinear ||
            !outPt.between(outPt.source.unsafePev, outPt.source.unsafeNext)))
      ) {
        lastOutPt = null;
        outPt.source.unsafePev.source.next = outPt.source.next;
        outPt.source.unsafeNext.source.prev = outPt.source.prev;
        outPt = outPt.source.unsafePev;
      } else if (outPt == lastOutPt) {
        break;
      } else {
        if (lastOutPt === null) {
          lastOutPt = outPt;
        }

        outPt = outPt.source.unsafeNext;
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

  public get area(): number {
    if (this.pointer === null) {
      return 0;
    }

    let result: number = 0;
    let pointer: OutPt = this.pointer;

    do {
      result =
        result +
        (pointer.source.unsafePev.x + pointer.x) *
          (pointer.source.unsafePev.y - pointer.y);
      pointer = pointer.source.unsafeNext;
    } while (pointer !== this.pointer);

    return result * 0.5;
  }

  public get hasPointer(): boolean {
    return this.pointer !== null;
  }

  public get unsafePointer(): OutPt {
    return this.pointer as OutPt;
  }

  public static param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
    let outRec: OutRec | null = outRec1;

    do {
      outRec = outRec.left;

      if (outRec == outRec2) {
        return true;
      }
    } while (outRec !== null);

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
      case pointer1.source.next == pointer1:
        return outRec2;
      case pointer2.source.next == pointer2:
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
