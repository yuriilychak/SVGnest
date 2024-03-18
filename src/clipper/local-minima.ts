import { EdgeSide } from "./enums";
import TEdge from "./edge/t-edge";

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

  public init(edge: TEdge, isClockwise: boolean, isClosed: boolean): void {
    if (isClockwise) {
      this.LeftBound = edge;
      this.RightBound = edge.Prev;
    } else {
      this.LeftBound = edge.Prev;
      this.RightBound = edge;
    }

    this.LeftBound.Side = EdgeSide.Left;
    this.RightBound.Side = EdgeSide.Right;

    if (!isClosed) {
      this.LeftBound.WindDelta = 0;
    } else if (this.LeftBound.Next == this.RightBound) {
      this.LeftBound.WindDelta = -1;
    } else {
      this.LeftBound.WindDelta = 1;
    }

    this.RightBound.WindDelta = -this.LeftBound.WindDelta;
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

  public clean(): void {
    if (this.LeftBound.OutIdx == LocalMinima._skip) {
      this.LeftBound = null;
    } else if (this.RightBound.OutIdx == LocalMinima._skip) {
      this.RightBound = null;
    }
  }

  private static _skip: number = -2;
}
