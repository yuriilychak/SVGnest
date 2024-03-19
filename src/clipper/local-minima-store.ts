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
      startX = isClockwise ? edge.Prev.Bot.X : edge.Next.Bot.X;

      if (edge.Bot.X !== startX) {
        edge.reverseHorizontal();
      }
    }

    if (result.OutIdx != TEdge.skip) {
      if (isClockwise) {
        while (
          result.Top.Y == result.Next.Bot.Y &&
          result.Next.OutIdx != TEdge.skip
        ) {
          result = result.Next;
        }

        if (
          result.deltaX == TEdge.horizontal &&
          result.Next.OutIdx != TEdge.skip
        ) {
          //nb: at the top of a bound, horizontals are added to the bound
          //only when the preceding edge attaches to the horizontal's left vertex
          //unless a Skip edge is encountered when that becomes the top divide
          hEdge = result;

          while (hEdge.Prev.deltaX == TEdge.horizontal) {
            hEdge = hEdge.Prev;
          }

          if (hEdge.Prev.Top.X == result.Next.Top.X) {
            if (!isClockwise) {
              result = hEdge.Prev;
            }
          } else if (hEdge.Prev.Top.X > result.Next.Top.X) {
            result = hEdge.Prev;
          }
        }

        while (edge != result) {
          edge.NextInLML = edge.Next;

          if (
            edge.deltaX == TEdge.horizontal &&
            edge != startEdge &&
            edge.Bot.X != edge.Prev.Top.X
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.Next;
        }

        if (
          edge.deltaX == TEdge.horizontal &&
          edge != startEdge &&
          edge.Bot.X != edge.Prev.Top.X
        ) {
          edge.reverseHorizontal();
        }

        result = result.Next;
        //move to the edge just beyond current bound
      } else {
        while (
          result.Top.Y == result.Prev.Bot.Y &&
          result.Prev.OutIdx != TEdge.skip
        )
          result = result.Prev;
        if (
          result.deltaX == TEdge.horizontal &&
          result.Prev.OutIdx != TEdge.skip
        ) {
          hEdge = result;

          while (hEdge.Next.deltaX == TEdge.horizontal) {
            hEdge = hEdge.Next;
          }

          if (hEdge.Next.Top.X == result.Prev.Top.X) {
            if (!isClockwise) {
              result = hEdge.Next;
            }
          } else if (hEdge.Next.Top.X > result.Prev.Top.X) {
            result = hEdge.Next;
          }
        }

        while (edge != result) {
          edge.NextInLML = edge.Prev;

          if (
            edge.deltaX == TEdge.horizontal &&
            edge != startEdge &&
            edge.Bot.X != edge.Next.Top.X
          ) {
            edge.reverseHorizontal();
          }
          edge = edge.Prev;
        }

        if (
          edge.deltaX == TEdge.horizontal &&
          edge != startEdge &&
          edge.Bot.X != edge.Next.Top.X
        ) {
          edge.reverseHorizontal();
        }
        result = result.Prev;
        //move to the edge just beyond current bound
      }
    }

    if (result.OutIdx == TEdge.skip) {
      //if edges still remain in the current bound beyond the skip edge then
      //create another LocMin and call ProcessBound once more
      edge = result;

      if (isClockwise) {
        while (edge.Top.Y == edge.Next.Bot.Y) {
          edge = edge.Next;
        }
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge != result && edge.deltaX == TEdge.horizontal) {
          edge = edge.Prev;
        }
      } else {
        while (edge.Top.Y == edge.Prev.Bot.Y) {
          edge = edge.Prev;
        }

        while (edge != result && edge.deltaX == TEdge.horizontal) {
          edge = edge.Next;
        }
      }
      if (edge == result) {
        result = isClockwise ? edge.Next : edge.Prev;
      } else {
        //there are more edges in the bound beyond result starting with E

        edge = isClockwise ? result.Next : result.Prev;

        locMin = new LocalMinima(edge.Bot.Y, null, edge);
        locMin.right.WindDelta = 0;
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
