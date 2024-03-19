import IntPoint from "./int-point";

export default class OutPt {
  public index: number = 0;
  public point: IntPoint = new IntPoint();
  public next: OutPt = null;
  public prev: OutPt = null;

  public duplicate(isInsertAfter: boolean): OutPt {
    const result: OutPt = new OutPt();

    result.point.set(this.point);
    result.index = this.index;

    if (isInsertAfter) {
      result.next = this.next;
      result.prev = this;
      this.next.prev = result;
      this.next = result;
    } else {
      result.prev = this.prev;
      result.next = this;
      this.prev.next = result;
      this.prev = result;
    }

    return result;
  }

  public exclude(): OutPt {
    const result: OutPt = this.prev;

    result.next = this.next;
    this.next.prev = result;

    result.index = 0;

    return result;
  }

  public dispose(): void {
    let pointer: OutPt = this;
    pointer.prev.next = null;

    while (pointer !== null) {
      pointer = pointer.next;
    }
  }

  public reverse(): void {
    let pointer1: OutPt = this;
    let pointer2: OutPt;

    do {
      pointer2 = pointer1.next;
      pointer1.next = pointer1.prev;
      pointer1.prev = pointer2;
      pointer1 = pointer2;
    } while (pointer1 !== this);
  }

  public get pointCount(): number {
    let result: number = 0;
    let outPt: OutPt = this;

    do {
      ++result;
      outPt = outPt.next;
    } while (outPt !== this);

    return result;
  }

  public get bottomPt(): OutPt {
    let outPt: OutPt = this;
    let dups: OutPt = null;
    let nextOutPt: OutPt = outPt.next;

    while (nextOutPt != outPt) {
      if (nextOutPt.point.Y > outPt.point.Y) {
        outPt = nextOutPt;
        dups = null;
      } else if (
        nextOutPt.point.Y === outPt.point.Y &&
        nextOutPt.point.X <= outPt.point.X
      ) {
        if (nextOutPt.point.X < outPt.point.X) {
          dups = null;
          outPt = nextOutPt;
        } else {
          if (nextOutPt.next !== outPt && nextOutPt.prev !== outPt)
            dups = nextOutPt;
        }
      }
      nextOutPt = nextOutPt.next;
    }

    if (dups !== null) {
      while (dups != nextOutPt) {
        if (!OutPt.firstIsBottomPt(nextOutPt, dups)) {
          outPt = dups;
        }

        dups = dups.next;

        while (IntPoint.unequal(dups.point, outPt.point)) {
          dups = dups.next;
        }
      }
    }
    return outPt;
  }

  public static pointInPolygon(point: IntPoint, outPt: OutPt): number {
    let result: number = 0;
    let startOp: OutPt = outPt;
    let offset1: IntPoint = new IntPoint();
    let offset2: IntPoint = new IntPoint();
    let cross: number;

    while (true) {
      offset1.set(outPt.point).sub(point);
      offset2.set(outPt.next.point).sub(point);

      if (
        outPt.next.point.equal(point) ||
        (offset2.Y === 0 && offset1.Y === 0 && offset2.X > 0 === offset1.X < 0)
      ) {
        return -1;
      }

      if (offset1.Y < 0 === offset2.Y >= 0) {
        if (Math.sign(offset1.X) * Math.sign(offset2.X) < 0) {
          cross = offset2.cross(offset1);

          if (cross === 0) {
            return -1;
          }

          if (cross > 0 == offset2.Y - offset1.Y > 0) {
            result = 1 - result;
          }
        } else if (offset1.X >= 0 && offset2.X > 0) {
          result = 1 - result;
        }
      }

      outPt = outPt.next;

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
      res = OutPt.pointInPolygon(outPt.point, outPt2);

      if (res >= 0) {
        return res != 0;
      }

      outPt = outPt.next;
    } while (outPt != outPt1);

    return true;
  }

  public static firstIsBottomPt(point1: OutPt, point2: OutPt): boolean {
    let outPt: OutPt = point1.prev;

    while (IntPoint.equal(outPt.point, point1.point) && outPt != point1) {
      outPt = outPt.prev;
    }

    const dx1p: number = Math.abs(IntPoint.deltaX(point1.point, outPt.point));

    outPt = point1.next;

    while (IntPoint.equal(outPt.point, point1.point) && outPt != point1) {
      outPt = outPt.next;
    }

    const dx1n: number = Math.abs(IntPoint.deltaX(point1.point, outPt.point));

    outPt = point2.prev;

    while (IntPoint.equal(outPt.point, point2.point) && outPt != point2) {
      outPt = outPt.prev;
    }

    const dx2p: number = Math.abs(IntPoint.deltaX(point2.point, outPt.point));

    outPt = point2.next;

    while (IntPoint.equal(outPt.point, point2.point) && outPt != point2) {
      outPt = outPt.next;
    }

    const dx2n: number = Math.abs(IntPoint.deltaX(point2.point, outPt.point));

    return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
  }
}
