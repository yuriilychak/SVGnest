import IntPoint from "./int-point";

export default class OutPt {
  public Idx: number = 0;
  public Pt: IntPoint = new IntPoint();
  public Next: OutPt = null;
  public Prev: OutPt = null;

  public duplicate(isInsertAfter: boolean): OutPt {
    const result: OutPt = new OutPt();
    //result.Pt = outPt.Pt;
    result.Pt.X = this.Pt.X;
    result.Pt.Y = this.Pt.Y;
    result.Idx = this.Idx;
    if (isInsertAfter) {
      result.Next = this.Next;
      result.Prev = this;
      this.Next.Prev = result;
      this.Next = result;
    } else {
      result.Prev = this.Prev;
      result.Next = this;
      this.Prev.Next = result;
      this.Prev = result;
    }
    return result;
  }

  public exclude(): OutPt {
    const result: OutPt = this.Prev;

    result.Next = this.Next;
    this.Next.Prev = result;

    result.Idx = 0;
    return result;
  }

  public dispose(): void {
    let pointer: OutPt = this;
    pointer.Prev.Next = null;

    while (pointer !== null) {
      pointer = pointer.Next;
    }
  }

  public reverse(): void {
    let pointer1: OutPt = this;
    let pointer2: OutPt;

    do {
      pointer2 = pointer1.Next;
      pointer1.Next = pointer1.Prev;
      pointer1.Prev = pointer2;
      pointer1 = pointer2;
    } while (pointer1 !== this);
  }

  public get pointCount(): number {
    let result: number = 0;
    let p: OutPt = this;

    do {
      ++result;
      p = p.Next;
    } while (p !== this);

    return result;
  }

  public get bottomPt(): OutPt {
    let pp: OutPt = this;
    var dups = null;
    var p = pp.Next;
    while (p != pp) {
      if (p.Pt.Y > pp.Pt.Y) {
        pp = p;
        dups = null;
      } else if (p.Pt.Y == pp.Pt.Y && p.Pt.X <= pp.Pt.X) {
        if (p.Pt.X < pp.Pt.X) {
          dups = null;
          pp = p;
        } else {
          if (p.Next != pp && p.Prev != pp) dups = p;
        }
      }
      p = p.Next;
    }
    if (dups !== null) {
      //there appears to be at least 2 vertices at bottomPt so ...
      while (dups != p) {
        if (!OutPt.firstIsBottomPt(p, dups)) pp = dups;
        dups = dups.Next;
        while (IntPoint.unequal(dups.Pt, pp.Pt)) dups = dups.Next;
      }
    }
    return pp;
  }

  public static pointInPolygon(pt: IntPoint, op: OutPt) {
    //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
    //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
    var result = 0;
    var startOp = op;
    for (;;) {
      var poly0x = op.Pt.X,
        poly0y = op.Pt.Y;
      var poly1x = op.Next.Pt.X,
        poly1y = op.Next.Pt.Y;
      if (poly1y == pt.Y) {
        if (
          poly1x == pt.X ||
          (poly0y == pt.Y && poly1x > pt.X == poly0x < pt.X)
        )
          return -1;
      }
      if (poly0y < pt.Y != poly1y < pt.Y) {
        if (poly0x >= pt.X) {
          if (poly1x > pt.X) result = 1 - result;
          else {
            var d =
              (poly0x - pt.X) * (poly1y - pt.Y) -
              (poly1x - pt.X) * (poly0y - pt.Y);
            if (d == 0) return -1;
            if (d > 0 == poly1y > poly0y) result = 1 - result;
          }
        } else {
          if (poly1x > pt.X) {
            var d =
              (poly0x - pt.X) * (poly1y - pt.Y) -
              (poly1x - pt.X) * (poly0y - pt.Y);
            if (d == 0) return -1;
            if (d > 0 == poly1y > poly0y) result = 1 - result;
          }
        }
      }
      op = op.Next;
      if (startOp == op) break;
    }
    return result;
  }

  public static poly2ContainsPoly1(outPt1: OutPt, outPt2: OutPt): boolean {
    var op = outPt1;
    do {
      var res = OutPt.pointInPolygon(op.Pt, outPt2);
      if (res >= 0) return res != 0;
      op = op.Next;
    } while (op != outPt1);
    return true;
  }

  public static firstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
    var p = btmPt1.Prev;
    while (IntPoint.equal(p.Pt, btmPt1.Pt) && p != btmPt1) p = p.Prev;
    var dx1p = Math.abs(IntPoint.getDx(btmPt1.Pt, p.Pt));
    p = btmPt1.Next;
    while (IntPoint.equal(p.Pt, btmPt1.Pt) && p != btmPt1) p = p.Next;
    var dx1n = Math.abs(IntPoint.getDx(btmPt1.Pt, p.Pt));
    p = btmPt2.Prev;
    while (IntPoint.equal(p.Pt, btmPt2.Pt) && p != btmPt2) p = p.Prev;
    var dx2p = Math.abs(IntPoint.getDx(btmPt2.Pt, p.Pt));
    p = btmPt2.Next;
    while (IntPoint.equal(p.Pt, btmPt2.Pt) && p != btmPt2) p = p.Next;
    var dx2n = Math.abs(IntPoint.getDx(btmPt2.Pt, p.Pt));
    return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
  }
}
