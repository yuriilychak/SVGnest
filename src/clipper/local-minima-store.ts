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

    if (edge.isHorizontalX) {
      //it's possible for adjacent overlapping horz edges to start heading left
      //before finishing right, so ...
      startX = isClockwise
        ? edge.source.prev.bottom.x
        : edge.source.next.bottom.x;

      if (edge.bottom.x !== startX) {
        edge.reverseHorizontal();
      }
    }

    if (!result.isSkipped) {
      if (isClockwise) {
        while (
          result.top.y == result.source.next.bottom.y &&
          !result.source.next.isSkipped
        ) {
          result = result.source.next;
        }

        if (result.isHorizontalX && !result.source.next.isSkipped) {
          hEdge = result;

          while (hEdge.source.prev.isHorizontalX) {
            hEdge = hEdge.source.prev;
          }

          if (hEdge.source.prev.top.x == result.source.next.top.x) {
            if (!isClockwise) {
              result = hEdge.source.prev;
            }
          } else if (hEdge.source.prev.top.x > result.source.next.top.x) {
            result = hEdge.source.prev;
          }
        }

        while (edge != result) {
          edge.nextInLML = edge.source.next;

          if (
            edge.isHorizontalX &&
            edge != startEdge &&
            edge.bottom.x != edge.source.prev.top.x
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.source.next;
        }

        if (
          edge.isHorizontalX &&
          edge != startEdge &&
          edge.bottom.x != edge.source.prev.top.x
        ) {
          edge.reverseHorizontal();
        }

        result = result.source.next;
      } else {
        while (
          result.top.y == result.source.prev.bottom.y &&
          !result.source.prev.isSkipped
        ) {
          result = result.source.prev;
        }
        if (result.isHorizontalX && !result.source.prev.isSkipped) {
          hEdge = result;

          while (hEdge.source.next.isHorizontalX) {
            hEdge = hEdge.source.next;
          }

          if (hEdge.source.next.top.x == result.source.prev.top.x) {
            if (!isClockwise) {
              result = hEdge.source.next;
            }
          } else if (hEdge.source.next.top.x > result.source.prev.top.x) {
            result = hEdge.source.next;
          }
        }

        while (edge != result) {
          edge.nextInLML = edge.source.prev;

          if (
            edge.isHorizontalX &&
            edge != startEdge &&
            edge.bottom.x != edge.source.next.top.x
          ) {
            edge.reverseHorizontal();
          }
          edge = edge.source.prev;
        }

        if (
          edge.isHorizontalX &&
          edge != startEdge &&
          edge.bottom.x != edge.source.next.top.x
        ) {
          edge.reverseHorizontal();
        }
        result = result.source.prev;
        //move to the edge just beyond current bound
      }
    }

    if (result.isSkipped) {
      //if edges still remain in the current bound beyond the skip edge then
      //create another LocMin and call ProcessBound once more
      edge = result;

      if (isClockwise) {
        while (edge.top.y == edge.source.next.bottom.y) {
          edge = edge.source.next;
        }
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge != result && edge.isHorizontalX) {
          edge = edge.source.prev;
        }
      } else {
        while (edge.top.y == edge.source.prev.bottom.y) {
          edge = edge.source.prev;
        }

        while (edge != result && edge.isHorizontalX) {
          edge = edge.source.next;
        }
      }
      if (edge == result) {
        result = isClockwise ? edge.source.next : edge.source.prev;
      } else {
        //there are more edges in the bound beyond result starting with E

        edge = isClockwise ? result.source.next : result.source.prev;

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
