import { Point } from "../geom";
import PointRecord from "./point-record";

export default class OutPt extends Point {
  public index: number = 0;
  private _source: PointRecord<OutPt> = new PointRecord();

  init(index: number, point: Point, prev: OutPt, next: OutPt): void {
    this.set(point);
    this.index = index;
    this._source.update(prev, next);
  }

  public duplicate(isInsertAfter: boolean): OutPt {
    const result: OutPt = new OutPt();

    result.set(this);
    result.index = this.index;

    if (isInsertAfter) {
      result.source.next = this._source.unsafeNext;
      result.source.prev = this;
      this._source.unsafeNext.source.prev = result;
      this._source.next = result;
    } else {
      result.source.prev = this._source.prev;
      result.source.next = this;
      this._source.unsafePev.source.next = result;
      this._source.prev = result;
    }

    return result;
  }

  public exclude(): OutPt | null {
    if (!this._source.hasPrev) {
      return null;
    }

    const result: OutPt = this._source.unsafePev;

    result.source.next = this._source.next;
    this._source.unsafeNext.source.prev = result;

    result.index = 0;

    return result;
  }

  public dispose(): void {
    let pointer: OutPt | null = this;

    if (this._source.hasPrev) {
      pointer.source.unsafePev.source.next = null;
    }

    while (pointer !== null) {
      pointer = pointer.source.next;
    }
  }

  public reversePointer(): void {
    let pointer1: OutPt | null = this;
    let pointer2: OutPt | null = null;

    do {
      if (pointer1 === null) {
        break;
      }

      pointer2 = pointer1.source.next;
      pointer1.source.next = pointer1.source.prev;
      pointer1.source.prev = pointer2;
      pointer1 = pointer2;
    } while (pointer1 !== this);
  }

  public get pointCount(): number {
    let result: number = 0;
    let outPt: OutPt | null = this;

    do {
      if (outPt === null) {
        break;
      }

      ++result;
      outPt = outPt.source.next;
    } while (outPt !== this);

    return result;
  }

  public get bottomPt(): OutPt {
    let outPt: OutPt = this;
    let dups: OutPt | null = null;
    let nextOutPt: OutPt = outPt.source.unsafeNext;

    while (nextOutPt !== outPt) {
      if (nextOutPt.y > outPt.y) {
        outPt = nextOutPt;
        dups = null;
      } else if (nextOutPt.y === outPt.y && nextOutPt.x <= outPt.x) {
        if (nextOutPt.x < outPt.x) {
          dups = null;
          outPt = nextOutPt;
        } else {
          if (
            nextOutPt.source.next !== outPt &&
            nextOutPt.source.prev !== outPt
          )
            dups = nextOutPt;
        }
      }
      nextOutPt = nextOutPt.source.unsafeNext;
    }

    if (dups !== null) {
      while (dups !== nextOutPt) {
        if (!OutPt.firstIsBottomPt(nextOutPt, dups)) {
          outPt = dups;
        }

        dups = dups.source.unsafeNext;

        while (!dups.equal(outPt)) {
          dups = dups.source.unsafeNext;
        }
      }
    }
    return outPt;
  }

  public get source(): PointRecord<OutPt> {
    return this._source;
  }

  public static pointInPolygon(point: Point, outPt: OutPt): number {
    let result: number = 0;
    let startOp: OutPt = outPt;
    let offset1: Point = Point.empty();
    let offset2: Point = Point.empty();
    let cross: number;

    while (true) {
      offset1.set(outPt).sub(point);
      offset2.set(outPt.source.unsafeNext).sub(point);

      if (
        point.equal(outPt.source.unsafeNext) ||
        (offset2.y === 0 && offset1.y === 0 && offset2.x > 0 === offset1.x < 0)
      ) {
        return -1;
      }

      if (offset1.y < 0 === offset2.y >= 0) {
        if (Math.sign(offset1.x) * Math.sign(offset2.x) < 0) {
          cross = offset2.cross(offset1);

          if (cross === 0) {
            return -1;
          }

          if (cross > 0 == offset2.y - offset1.y > 0) {
            result = 1 - result;
          }
        } else if (offset1.x >= 0 && offset2.x > 0) {
          result = 1 - result;
        }
      }

      outPt = outPt.source.unsafeNext;

      if (startOp == outPt) {
        break;
      }
    }

    return result;
  }

  public static poly2ContainsPoly1(outPt1: OutPt, outPt2: OutPt): boolean {
    let outPt: OutPt = outPt1;
    let res: number = 0;

    do {
      res = OutPt.pointInPolygon(outPt, outPt2);

      if (res >= 0) {
        return res != 0;
      }

      outPt = outPt.source.unsafeNext;
    } while (outPt != outPt1);

    return true;
  }

  public static firstIsBottomPt(point1: OutPt, point2: OutPt): boolean {
    let outPt: OutPt = point1.source.unsafePev;

    while (outPt.equal(point1) && outPt != point1) {
      outPt = outPt.source.unsafePev;
    }

    const dx1p: number = Math.abs(Point.deltaX(point1, outPt));

    outPt = point1.source.unsafeNext;

    while (outPt.equal(point1) && outPt != point1) {
      outPt = outPt.source.unsafeNext;
    }

    const dx1n: number = Math.abs(Point.deltaX(point1, outPt));

    outPt = point2.source.unsafePev;

    while (outPt.equal(point2) && outPt != point2) {
      outPt = outPt.source.unsafePev;
    }

    const dx2p: number = Math.abs(Point.deltaX(point2, outPt));

    outPt = point2.source.unsafeNext;

    while (outPt.equal(point2) && outPt != point2) {
      outPt = outPt.source.unsafeNext;
    }

    const dx2n: number = Math.abs(Point.deltaX(point2, outPt));

    return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
  }
}
