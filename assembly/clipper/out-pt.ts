import { Point } from "../geom";
import PointRecord from "./point-record";

export default class OutPt extends Point {
  public index: i16 = 0;
  private _source: PointRecord<OutPt> = new PointRecord();

  init(index: i16, point: Point, prev: OutPt, next: OutPt): void {
    this.set(point);
    this.index = index;
    this._source.update(prev, next);
  }

  public updatePointer(prev: OutPt | null, next: OutPt | null): void {
    this._source.update(prev, next);
  }

  public duplicate(isInsertAfter: boolean): OutPt {
    const result: OutPt = new OutPt();

    result.set(this);
    result.index = this.index;

    if (isInsertAfter) {
      result.next = this._source.next;
      result.prev = this;
      (this._source.next as OutPt).prev = result;
      this._source.next = result;
    } else {
      result.prev = this._source.prev;
      result.next = this;
      (this._source.prev as OutPt).next = result;
      this._source.prev = result;
    }

    return result;
  }

  public exclude(): OutPt | null {
    const result: OutPt = this._source.prev as OutPt;

    result.next = this._source.next;

    if (this._source.next !== null) {
      this._source.next.prev = result;
    }

    result.index = 0;

    return result;
  }

  public dispose(): void {
    let pointer: OutPt = this;

    (pointer.prev as OutPt).next = null;

    while (pointer !== null) {
      pointer = pointer.next as OutPt;
    }
  }

  public reversePointer(): void {
    let pointer1: OutPt = this;
    let pointer2: OutPt;

    do {
      pointer2 = pointer1.next as OutPt;
      pointer1.next = pointer1.prev;
      pointer1.prev = pointer2;
      pointer1 = pointer2;
    } while (pointer1 !== this);
  }

  public get pointCount(): u16 {
    let result: u16 = 0;
    let outPt: OutPt = this;

    do {
      ++result;
      outPt = outPt.next as OutPt;
    } while (outPt !== this);

    return result;
  }

  public get bottomPt(): OutPt | null {
    let outPt: OutPt | null = this;
    let dups: OutPt | null = null;
    let nextOutPt: OutPt = outPt.next as OutPt;

    while (nextOutPt != outPt) {
      if (nextOutPt.y > outPt.y) {
        outPt = nextOutPt;
        dups = null;
      } else if (nextOutPt.y === outPt.y && nextOutPt.x <= outPt.x) {
        if (nextOutPt.x < outPt.x) {
          dups = null;
          outPt = nextOutPt;
        } else {
          if (nextOutPt.next !== outPt && nextOutPt.prev !== outPt)
            dups = nextOutPt;
        }
      }
      nextOutPt = nextOutPt.next as OutPt;
    }

    if (dups !== null) {
      while (dups != nextOutPt) {
        if (dups === null) {
          break;
        }

        if (!OutPt.firstIsBottomPt(nextOutPt, dups)) {
          outPt = dups;
        }

        dups = dups.next as OutPt;

        while (!dups.equal(outPt)) {
          dups = dups.next as OutPt;
        }
      }
    }
    return outPt;
  }

  public get next(): OutPt | null {
    return this._source.next;
  }

  public set next(value: OutPt | null) {
    this._source.next = value;
  }

  public get prev(): OutPt | null {
    return this._source.prev;
  }

  public set prev(value: OutPt | null) {
    this._source.prev = value;
  }

  public get isLooped(): boolean {
    return this._source.isLooped;
  }

  public static pointInPolygon(point: Point, outPt: OutPt): i16 {
    let result: i16 = 0;
    let startOp: OutPt = outPt;
    let offset1: Point = Point.empty();
    let offset2: Point = Point.empty();
    let cross: f64;

    while (true) {
      offset1.set(outPt).sub(point);
      offset2.set(outPt.next as Point).sub(point);

      if (
        (outPt.next !== null && outPt.next.equal(point)) ||
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

      outPt = outPt.next as OutPt;

      if (startOp == outPt) {
        break;
      }
    }

    return result;
  }

  public static poly2ContainsPoly1(outPt1: OutPt, outPt2: OutPt): boolean {
    let outPt: OutPt = outPt1;
    let res: i16 = 0;

    do {
      res = OutPt.pointInPolygon(outPt, outPt2);

      if (res >= 0) {
        return res != 0;
      }

      outPt = outPt.next as OutPt;
    } while (outPt != outPt1);

    return true;
  }

  public static firstIsBottomPt(point1: OutPt, point2: OutPt): boolean {
    let outPt: OutPt = point1.prev as OutPt;

    while (outPt.equal(point1) && outPt != point1) {
      outPt = outPt.prev as OutPt;
    }

    const dx1p: f64 = Math.abs(Point.deltaX(point1, outPt));

    outPt = point1.next as OutPt;

    while (outPt.equal(point1) && outPt != point1) {
      outPt = outPt.next as OutPt;
    }

    const dx1n: f64 = Math.abs(Point.deltaX(point1, outPt));

    outPt = point2.prev as OutPt;

    while (outPt.equal(point2) && outPt != point2) {
      outPt = outPt.prev as OutPt;
    }

    const dx2p: f64 = Math.abs(Point.deltaX(point2, outPt));

    outPt = point2.next as OutPt;

    while (outPt.equal(point2) && outPt != point2) {
      outPt = outPt.next as OutPt;
    }

    const dx2n: f64 = Math.abs(Point.deltaX(point2, outPt));

    return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
  }
}
