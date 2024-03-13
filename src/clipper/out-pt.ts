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

  public get pointCount(): number {
    let result: number = 0;
    let p: OutPt = this;

    do {
      ++result;
      p = p.Next;
    } while (p !== this);

    return result;
  }
}
