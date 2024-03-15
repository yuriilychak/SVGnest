import TEdge from "./t-edge";

export default class LocalMinima {
  public Y: number = 0;
  public LeftBound: TEdge = null;
  public RightBound: TEdge = null;
  public Next: LocalMinima = null;

  constructor(y: number, leftBound: TEdge = null, rightBound: TEdge = null) {
    this.Y = y;
    this.LeftBound = leftBound;
    this.RightBound = rightBound;
  }

  public insert(localMinima: LocalMinima): LocalMinima {
    if (localMinima.Y >= this.Y) {
      localMinima.Next = this;
      return localMinima;
    }

    let tmpLocalMinima: LocalMinima = this;

    while (
      tmpLocalMinima.Next !== null &&
      localMinima.Y < tmpLocalMinima.Next.Y
    ) {
      tmpLocalMinima = tmpLocalMinima.Next;
    }
    localMinima.Next = tmpLocalMinima.Next;
    tmpLocalMinima.Next = localMinima;

    return this;
  }
}
