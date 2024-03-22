import { TEdge } from "./edge";
import LocalMinima from "./local-minima";

export default class LocalMinimaStore {
  private _source: LocalMinima | null = null;
  private _current: LocalMinima | null = null;

  public processBound(inputEdge: TEdge, isClockwise: boolean): TEdge | null {
    let edge: TEdge | null = inputEdge;
    let startEdge: TEdge = edge;
    let result: TEdge | null = edge;
    let hEdge: TEdge;
    let locMin: LocalMinima;

    if (edge.isHorizontalX && !edge.source.isEmpty) {
      const tmpEdge: TEdge = edge.source.getByFlagUnsafe(!isClockwise);

      if (edge.bottom.x !== tmpEdge.bottom.x) {
        edge.reverseHorizontal();
      }
    }

    if (!result.isSkipped) {
      if (isClockwise) {
        while (
          result.source.hasNext &&
          result.top.y == result.source.unsafeNext.bottom.y &&
          !result.source.unsafeNext.isSkipped
        ) {
          result = result.source.unsafeNext;
        }

        if (
          result.isHorizontalX &&
          result.source.hasNext &&
          !result.source.unsafeNext.isSkipped
        ) {
          hEdge = result;

          while (hEdge.source.hasPrev && hEdge.source.unsafePev.isHorizontalX) {
            hEdge = hEdge.source.unsafePev;
          }

          if (
            hEdge.source.hasPrev &&
            result.source.hasNext &&
            hEdge.source.unsafePev.top.x === result.source.unsafeNext.top.x
          ) {
            if (!isClockwise) {
              result = hEdge.source.unsafePev;
            }
          } else if (
            hEdge.source.hasPrev &&
            result.source.hasNext &&
            hEdge.source.unsafePev.top.x > result.source.unsafeNext.top.x
          ) {
            result = hEdge.source.unsafePev;
          }
        }

        while (edge != result && edge !== null) {
          edge.nextInLML = edge.source.next;

          if (
            edge.isHorizontalX &&
            edge !== startEdge &&
            edge.source.hasPrev &&
            edge.bottom.x != edge.source.unsafePev.top.x
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.source.next;
        }

        if (
          edge !== null &&
          edge.isHorizontalX &&
          edge !== startEdge &&
          edge.source.hasPrev &&
          edge.bottom.x !== edge.source.unsafePev.top.x
        ) {
          edge.reverseHorizontal();
        }

        result = result.source.next;
      } else {
        while (
          result !== null &&
          result.source.hasPrev &&
          result.top.y === result.source.unsafePev.bottom.y &&
          !result.source.unsafePev.isSkipped
        ) {
          result = result.source.prev;
        }
        if (
          result !== null &&
          result.isHorizontalX &&
          result.source.hasPrev &&
          !result.source.unsafePev.isSkipped
        ) {
          hEdge = result;

          while (
            hEdge.source.hasNext &&
            hEdge.source.unsafeNext.isHorizontalX
          ) {
            hEdge = hEdge.source.unsafeNext;
          }

          if (
            hEdge.source.hasNext &&
            result.source.hasPrev &&
            hEdge.source.unsafeNext.top.x === result.source.unsafePev.top.x
          ) {
            if (!isClockwise) {
              result = hEdge.source.unsafeNext;
            }
          } else if (
            hEdge.source.hasNext &&
            result.source.hasPrev &&
            hEdge.source.unsafeNext.top.x > result.source.unsafePev.top.x
          ) {
            result = hEdge.source.unsafeNext;
          }
        }

        while (edge !== result) {
          if (edge !== null) {
            edge.nextInLML = edge.source.prev;
          }

          if (
            edge !== null &&
            edge.isHorizontalX &&
            edge != startEdge &&
            edge.source.hasNext &&
            edge.bottom.x !== edge.source.unsafeNext.top.x
          ) {
            edge.reverseHorizontal();
          }

          if (edge !== null) {
            edge = edge.source.prev;
          }
        }

        if (
          edge !== null &&
          edge.isHorizontalX &&
          edge != startEdge &&
          edge.source.hasNext &&
          edge.bottom.x !== edge.source.unsafeNext.top.x
        ) {
          edge.reverseHorizontal();
        }

        if (result !== null) {
          result = result.source.prev;
        }
      }
    }

    if (result !== null && result.isSkipped) {
      edge = result as TEdge;

      if (isClockwise) {
        while (
          edge.source.hasNext &&
          edge.top.y === edge.source.unsafeNext.bottom.y
        ) {
          edge = edge.source.unsafeNext;
        }
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge !== result && edge !== null && edge.isHorizontalX) {
          edge = edge.source.prev;
        }
      } else {
        while (
          edge.source.hasPrev &&
          edge.top.y === edge.source.unsafePev.bottom.y
        ) {
          edge = edge.source.unsafePev;
        }

        while (edge !== result && edge !== null && edge.isHorizontalX) {
          edge = edge.source.next;
        }
      }
      if (edge == result) {
        result = edge.source.getByFlagUnsafe(isClockwise);
      } else {
        //there are more edges in the bound beyond result starting with E

        edge = result.source.getByFlagUnsafe(isClockwise);

        locMin = new LocalMinima(edge.bottom.y, null, edge);
        locMin.unsafeLeft.windDelta = 0;
        result = this.processBound(locMin.unsafeRight, isClockwise);

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
