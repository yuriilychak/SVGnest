import { TEdge } from "./edge";
import LocalMinima from "./local-minima";

export default class LocalMinimaStore {
  private _source: LocalMinima = null;
  private _current: LocalMinima = null;

  public processBound(edge: TEdge, isClockwise: boolean): TEdge {
    let startEdge: TEdge = edge;
    let result: TEdge = edge;
    let hEdge: TEdge;
    let startX: number = 0;
    let locMin: LocalMinima;

    if (edge.deltaX == TEdge.horizontal) {
      //it's possible for adjacent overlapping horz edges to start heading left
      //before finishing right, so ...
      startX = isClockwise ? edge.prev.bottom.x : edge.next.bottom.x;

      if (edge.bottom.x !== startX) {
        edge.reverseHorizontal();
      }
    }

    if (result.outIndex != TEdge.skip) {
      if (isClockwise) {
        while (
          result.top.y == result.next.bottom.y &&
          result.next.outIndex != TEdge.skip
        ) {
          result = result.next;
        }

        if (
          result.deltaX == TEdge.horizontal &&
          result.next.outIndex != TEdge.skip
        ) {
          //nb: at the top of a bound, horizontals are added to the bound
          //only when the preceding edge attaches to the horizontal's left vertex
          //unless a Skip edge is encountered when that becomes the top divide
          hEdge = result;

          while (hEdge.prev.deltaX == TEdge.horizontal) {
            hEdge = hEdge.prev;
          }

          if (hEdge.prev.top.x == result.next.top.x) {
            if (!isClockwise) {
              result = hEdge.prev;
            }
          } else if (hEdge.prev.top.x > result.next.top.x) {
            result = hEdge.prev;
          }
        }

        while (edge != result) {
          edge.nextInLML = edge.next;

          if (
            edge.deltaX == TEdge.horizontal &&
            edge != startEdge &&
            edge.bottom.x != edge.prev.top.x
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.next;
        }

        if (
          edge.deltaX == TEdge.horizontal &&
          edge != startEdge &&
          edge.bottom.x != edge.prev.top.x
        ) {
          edge.reverseHorizontal();
        }

        result = result.next;
      } else {
        while (
          result.top.y == result.prev.bottom.y &&
          result.prev.outIndex != TEdge.skip
        )
          result = result.prev;
        if (
          result.deltaX == TEdge.horizontal &&
          result.prev.outIndex != TEdge.skip
        ) {
          hEdge = result;

          while (hEdge.next.deltaX == TEdge.horizontal) {
            hEdge = hEdge.next;
          }

          if (hEdge.next.top.x == result.prev.top.x) {
            if (!isClockwise) {
              result = hEdge.next;
            }
          } else if (hEdge.next.top.x > result.prev.top.x) {
            result = hEdge.next;
          }
        }

        while (edge != result) {
          edge.nextInLML = edge.prev;

          if (
            edge.deltaX == TEdge.horizontal &&
            edge != startEdge &&
            edge.bottom.x != edge.next.top.x
          ) {
            edge.reverseHorizontal();
          }
          edge = edge.prev;
        }

        if (
          edge.deltaX == TEdge.horizontal &&
          edge != startEdge &&
          edge.bottom.x != edge.next.top.x
        ) {
          edge.reverseHorizontal();
        }
        result = result.prev;
        //move to the edge just beyond current bound
      }
    }

    if (result.outIndex == TEdge.skip) {
      //if edges still remain in the current bound beyond the skip edge then
      //create another LocMin and call ProcessBound once more
      edge = result;

      if (isClockwise) {
        while (edge.top.y == edge.next.bottom.y) {
          edge = edge.next;
        }
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge != result && edge.deltaX == TEdge.horizontal) {
          edge = edge.prev;
        }
      } else {
        while (edge.top.y == edge.prev.bottom.y) {
          edge = edge.prev;
        }

        while (edge != result && edge.deltaX == TEdge.horizontal) {
          edge = edge.next;
        }
      }
      if (edge == result) {
        result = isClockwise ? edge.next : edge.prev;
      } else {
        //there are more edges in the bound beyond result starting with E

        edge = isClockwise ? result.next : result.prev;

        locMin = new LocalMinima(edge.bottom.y, null, edge);
        locMin.right.windDelta = 0;
        result = this.processBound(locMin.right, isClockwise);

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

  public get source(): LocalMinima {
    return this._source;
  }

  public get current(): LocalMinima {
    return this._current;
  }

  public get hasCurrent(): boolean {
    return this._current !== null;
  }
}
