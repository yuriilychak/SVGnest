import ScanbeamStore from "./scanbeam-store";
import TEdge from "./t-edge";

export default class ActiveEdge {
  private _source: TEdge = null;

  public insert(edge: TEdge, startEdge: TEdge = null): void {
    if (this._source === null) {
      edge.updateAEL(null, null);
      this._source = edge;
    } else if (
      startEdge === null &&
      TEdge.e2InsertsBeforeE1(this._source, edge)
    ) {
      edge.updateAEL(null, this._source);
      this._source.PrevInAEL = edge;
      this._source = edge;
    } else {
      if (startEdge === null) {
        startEdge = this._source;
      }

      while (
        startEdge.NextInAEL !== null &&
        !TEdge.e2InsertsBeforeE1(startEdge.NextInAEL, edge)
      ) {
        startEdge = startEdge.NextInAEL;
      }

      edge.NextInAEL = startEdge.NextInAEL;

      if (startEdge.NextInAEL !== null) {
        startEdge.NextInAEL.PrevInAEL = edge;
      }

      edge.PrevInAEL = startEdge;
      startEdge.NextInAEL = edge;
    }
  }

  public swap(edge1: TEdge, edge2: TEdge): void {
    //check that one or other edge hasn't already been removed from AEL ...
    if (
      edge1.NextInAEL == edge1.PrevInAEL ||
      edge2.NextInAEL == edge2.PrevInAEL
    ) {
      return;
    }

    let next: TEdge;
    let prev: TEdge;

    if (edge1.NextInAEL == edge2) {
      next = edge2.NextInAEL;

      if (next !== null) {
        next.PrevInAEL = edge1;
      }

      prev = edge1.PrevInAEL;

      if (prev !== null) {
        prev.NextInAEL = edge2;
      }

      edge1.updateAEL(edge2, next);
      edge2.updateAEL(prev, edge1);
    } else if (edge2.NextInAEL == edge1) {
      next = edge1.NextInAEL;

      if (next !== null) {
        next.PrevInAEL = edge2;
      }

      prev = edge2.PrevInAEL;

      if (prev !== null) {
        prev.NextInAEL = edge1;
      }

      edge1.updateAEL(prev, edge2);
      edge2.updateAEL(edge1, next);
    } else {
      next = edge1.NextInAEL;
      prev = edge1.PrevInAEL;
      edge1.NextInAEL = edge2.NextInAEL;

      if (edge1.NextInAEL !== null) {
        edge1.NextInAEL.PrevInAEL = edge1;
      }

      edge1.PrevInAEL = edge2.PrevInAEL;

      if (edge1.PrevInAEL !== null) {
        edge1.PrevInAEL.NextInAEL = edge1;
      }

      edge2.NextInAEL = next;

      if (edge2.NextInAEL !== null) {
        edge2.NextInAEL.PrevInAEL = edge2;
      }

      edge2.PrevInAEL = prev;

      if (edge2.PrevInAEL !== null) {
        edge2.PrevInAEL.NextInAEL = edge2;
      }
    }

    if (edge1.PrevInAEL === null) {
      this._source = edge1;
    } else if (edge2.PrevInAEL === null) {
      this._source = edge2;
    }
  }

  public update(edge: TEdge, scabeam: ScanbeamStore): TEdge {
    if (edge.NextInLML === null) {
      console.error("UpdateEdgeIntoAEL: invalid call");
    }

    const prev: TEdge = edge.PrevInAEL;
    const next: TEdge = edge.NextInAEL;

    edge.NextInLML.OutIdx = edge.OutIdx;

    if (prev !== null) {
      prev.NextInAEL = edge.NextInLML;
    } else {
      this._source = edge.NextInLML;
    }

    if (next !== null) {
      next.PrevInAEL = edge.NextInLML;
    }

    edge.NextInLML.Side = edge.Side;
    edge.NextInLML.WindDelta = edge.WindDelta;
    edge.NextInLML.WindCnt = edge.WindCnt;
    edge.NextInLML.WindCnt2 = edge.WindCnt2;
    edge = edge.NextInLML;
    edge.Curr.set(edge.Bot);
    edge.updateAEL(prev, next);

    if (!edge.isHorizontal) {
      scabeam.insert(edge.Top.Y);
    }

    return edge;
  }

  public delete(edge: TEdge): void {
    const prev: TEdge = edge.PrevInAEL;
    const next: TEdge = edge.NextInAEL;

    if (prev === null && next === null && edge !== this._source) {
      return;
    }
    //already deleted
    if (prev !== null) {
      prev.NextInAEL = next;
    } else {
      this._source = next;
    }

    if (next !== null) {
      next.PrevInAEL = prev;
    }

    edge.updateAEL(null, null);
  }

  public clean(): void {
    this._source = null;
  }

  public get source(): TEdge {
    return this._source;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
