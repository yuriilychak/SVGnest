import { EdgeSide } from "./enums";
import TEdge from "./edge/t-edge";
import PointRecord from "./point-record";

export default class LocalMinima {
  private _y: number = 0;
  private _next: LocalMinima | null = null;
  private _source: PointRecord<TEdge>;

  constructor(
    y: number,
    left: TEdge | null = null,
    right: TEdge | null = null
  ) {
    this._y = y;
    this._source = new PointRecord<TEdge>(left, right);
  }

  public init(edge: TEdge, isClockwise: boolean, isClosed: boolean): void {
    if (isClockwise) {
      this._source.update(edge, edge.source.prev);
    } else {
      this._source.update(edge.source.prev, edge);
    }

    this._source.unsafePev.side = EdgeSide.Left;
    this._source.unsafeNext.side = EdgeSide.Right;

    if (!isClosed) {
      this._source.unsafePev.windDelta = 0;
    } else if (this._source.unsafePev.source.next == this._source.unsafeNext) {
      this._source.unsafePev.windDelta = -1;
    } else {
      this._source.unsafePev.windDelta = 1;
    }

    this._source.unsafeNext.windDelta = -this._source.unsafePev.windDelta;
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
    if (this._source.unsafePev.isSkipped) {
      this._source.prev = null;
    } else if (this._source.unsafeNext.isSkipped) {
      this._source.next = null;
    }
  }

  //ie nothing to process
  //reset all edges ...
  public reset(): void {
    let localMinima: LocalMinima | null = this;

    while (localMinima !== null) {
      if (localMinima.left != null) {
        localMinima.left.fromSide(EdgeSide.Left);
      }

      if (localMinima.right != null) {
        localMinima.right.fromSide(EdgeSide.Right);
      }

      localMinima = localMinima.next;
    }
  }

  public get unsafeLeft(): TEdge {
    return this._source.unsafePev;
  }

  public get left(): TEdge | null {
    return this._source.prev;
  }

  public get right(): TEdge | null {
    return this._source.next;
  }

  public get unsafeRight(): TEdge {
    return this._source.unsafeNext;
  }

  public get next(): LocalMinima | null {
    return this._next;
  }

  protected set next(value: LocalMinima | null) {
    this._next = value;
  }

  public get y(): number {
    return this._y;
  }
}
