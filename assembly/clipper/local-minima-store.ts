import { TEdge } from "./edge";
import LocalMinima from "./local-minima";

export default class LocalMinimaStore {
  private _source: LocalMinima | null = null;
  private _current: LocalMinima | null = null;

  public processBound(edge: TEdge, isClockwise: boolean): TEdge | null {
    let startEdge: TEdge = edge;
    let result: TEdge | null = edge;
    let hEdge: TEdge;
    let startX: f64 = 0;
    let locMin: LocalMinima;

    if (edge.isHorizontalX) {
      //it's possible for adjacent overlapping horz edges to start heading left
      //before finishing right, so ...
      startX = isClockwise
        ? (edge.prev as TEdge).bottom.x
        : (edge.next as TEdge).bottom.x;

      if (edge.bottom.x !== startX) {
        edge.reverseHorizontal();
      }
    }

    if (result !== null && result.outIndex != TEdge.skip) {
      if (isClockwise) {
        while (
          result !== null &&
          result.next !== null &&
          result.top.y == result.next.bottom.y &&
          result.next.outIndex != TEdge.skip
        ) {
          result = result.next as TEdge;
        }

        if (
          result !== null &&
          result.next !== null &&
          result.isHorizontalX &&
          result.next.outIndex != TEdge.skip
        ) {
          //nb: at the top of a bound, horizontals are added to the bound
          //only when the preceding edge attaches to the horizontal's left vertex
          //unless a Skip edge is encountered when that becomes the top divide
          hEdge = result;

          while (hEdge.prev !== null && hEdge.prev.isHorizontalX) {
            hEdge = hEdge.prev;
          }

          if (hEdge.prev !== null && hEdge.prev.top.x == result.next.top.x) {
            if (!isClockwise) {
              result = hEdge.prev;
            }
          } else if (
            hEdge.prev !== null &&
            hEdge.prev.top.x > result.next.top.x
          ) {
            result = hEdge.prev;
          }
        }

        while (edge != result) {
          edge.nextInLML = edge.next;

          if (
            edge.prev !== null &&
            edge.isHorizontalX &&
            edge != startEdge &&
            edge.bottom.x != edge.prev.top.x
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.next as TEdge;
        }

        if (
          edge.prev !== null &&
          edge.isHorizontalX &&
          edge != startEdge &&
          edge.bottom.x != edge.prev.top.x
        ) {
          edge.reverseHorizontal();
        }

        result = result.next;
      } else {
        while (
          result !== null &&
          result.prev !== null &&
          result.top.y == result.prev.bottom.y &&
          result.prev.outIndex != TEdge.skip
        )
          result = result.prev;
        if (
          result.isHorizontalX &&
          result.prev !== null &&
          result.prev.outIndex != TEdge.skip
        ) {
          hEdge = result;

          while (hEdge.next !== null && (hEdge.next as TEdge).isHorizontalX) {
            hEdge = hEdge.next as TEdge;
          }

          if (
            hEdge.next !== null &&
            (hEdge.next as TEdge).top.x ==
              ((result as TEdge).prev as TEdge).top.x
          ) {
            if (!isClockwise) {
              result = hEdge.next;
            }
          } else if (
            hEdge.next !== null &&
            (hEdge.next as TEdge).top.x >
              ((result as TEdge).prev as TEdge).top.x
          ) {
            result = hEdge.next;
          }
        }

        while (edge != result) {
          edge.nextInLML = edge.prev;

          if (
            edge.isHorizontalX &&
            edge != startEdge &&
            edge.next !== null &&
            edge.bottom.x != (edge.next as TEdge).top.x
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.prev as TEdge;
        }

        if (
          edge.isHorizontalX &&
          edge != startEdge &&
          edge.next !== null &&
          edge.bottom.x !== (edge.next as TEdge).top.x
        ) {
          edge.reverseHorizontal();
        }
        result = (result as TEdge).prev;
        //move to the edge just beyond current bound
      }
    }

    if (result !== null && result.outIndex == TEdge.skip) {
      edge = result;

      if (isClockwise) {
        while (
          edge.next !== null &&
          edge.top.y == (edge.next as TEdge).bottom.y
        ) {
          edge = edge.next as TEdge;
        }
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge != result && edge.isHorizontalX) {
          edge = edge.prev as TEdge;
        }
      } else {
        while (
          edge.prev !== null &&
          edge.top.y == (edge.prev as TEdge).bottom.y
        ) {
          edge = edge.prev as TEdge;
        }

        while (edge != result && edge.isHorizontalX) {
          edge = edge.next as TEdge;
        }
      }
      if (edge == result) {
        result = isClockwise ? edge.next : edge.prev;
      } else {
        edge = (isClockwise ? result.next : result.prev) as TEdge;
        locMin = new LocalMinima(edge.bottom.y, null, edge);
        (locMin.right as TEdge).windDelta = 0;
        result = this.processBound(locMin.right as TEdge, isClockwise);

        this.insert(locMin);
      }
    }

    return result;
  }

  public insert(localMinima: LocalMinima): void {
    this._source =
      this._source === null ? localMinima : this._source.insert(localMinima);
  }

  public reset(): boolean {
    this._current = this._source;

    if (this._source === null) {
      return false;
    }

    this._source.reset();

    return true;
  }

  public pop(): void {
    if (this._current === null) {
      return;
    }

    this._current = this._current.next;
  }

  public get source(): LocalMinima | null {
    return this._source;
  }

  public get current(): LocalMinima | null {
    return this._current;
  }

  public get hasCurrent(): boolean {
    return this._current !== null;
  }
}
