import { EdgeSide } from "./enums";
import TEdge from "./edge/t-edge";

export default class LocalMinima {
  private _y: number = 0;
  private _next: LocalMinima = null;
  private _right: TEdge = null;
  private _left: TEdge = null;

  constructor(y: number, left: TEdge = null, right: TEdge = null) {
    this._y = y;
    this._left = left;
    this._right = right;
  }

  public init(edge: TEdge, isClockwise: boolean, isClosed: boolean): void {
    if (isClockwise) {
      this._left = edge;
      this._right = edge.Prev;
    } else {
      this._left = edge.Prev;
      this._right = edge;
    }

    this._left.Side = EdgeSide.Left;
    this._right.Side = EdgeSide.Right;

    if (!isClosed) {
      this._left.WindDelta = 0;
    } else if (this._left.Next == this._right) {
      this._left.WindDelta = -1;
    } else {
      this._left.WindDelta = 1;
    }

    this._right.WindDelta = -this._left.WindDelta;
  }

  public insert(localMinima: LocalMinima): LocalMinima {
    if (localMinima.y >= this.y) {
      localMinima.next = this;
      return localMinima;
    }

    let tmpLocalMinima: LocalMinima = this;

    while (
      tmpLocalMinima.next !== null &&
      localMinima.y < tmpLocalMinima.next.y
    ) {
      tmpLocalMinima = tmpLocalMinima.next;
    }

    localMinima.next = tmpLocalMinima.next;
    tmpLocalMinima.next = localMinima;

    return this;
  }

  public clean(): void {
    if (this._left.OutIdx == TEdge.skip) {
      this._left = null;
    } else if (this._right.OutIdx == TEdge.skip) {
      this._right = null;
    }
  }

  //ie nothing to process
  //reset all edges ...
  public reset(): void {
    let localMinima: LocalMinima = this;

    while (localMinima !== null) {
      if (localMinima.left != null) {
        localMinima.left.update(EdgeSide.Left);
      }

      if (localMinima.right != null) {
        localMinima.right.update(EdgeSide.Right);
      }

      localMinima = localMinima.next;
    }
  }

  public get left(): TEdge {
    return this._left;
  }

  public get right(): TEdge {
    return this._right;
  }

  public get next(): LocalMinima {
    return this._next;
  }

  protected set next(value: LocalMinima) {
    this._next = value;
  }

  public get y(): number {
    return this._y;
  }
}
