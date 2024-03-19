import ScanbeamStore from "../scanbeam-store";
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
      this._source.prevInAEL = edge;
      this._source = edge;
    } else {
      if (startEdge === null) {
        startEdge = this._source;
      }

      while (
        startEdge.nextInAEL !== null &&
        !TEdge.e2InsertsBeforeE1(startEdge.nextInAEL, edge)
      ) {
        startEdge = startEdge.nextInAEL;
      }

      edge.nextInAEL = startEdge.nextInAEL;

      if (startEdge.nextInAEL !== null) {
        startEdge.nextInAEL.prevInAEL = edge;
      }

      edge.prevInAEL = startEdge;
      startEdge.nextInAEL = edge;
    }
  }

  public swap(edge1: TEdge, edge2: TEdge): void {
    //check that one or other edge hasn't already been removed from AEL ...
    if (
      edge1.nextInAEL == edge1.prevInAEL ||
      edge2.nextInAEL == edge2.prevInAEL
    ) {
      return;
    }

    let next: TEdge;
    let prev: TEdge;

    if (edge1.nextInAEL == edge2) {
      next = edge2.nextInAEL;

      if (next !== null) {
        next.prevInAEL = edge1;
      }

      prev = edge1.prevInAEL;

      if (prev !== null) {
        prev.nextInAEL = edge2;
      }

      edge1.updateAEL(edge2, next);
      edge2.updateAEL(prev, edge1);
    } else if (edge2.nextInAEL == edge1) {
      next = edge1.nextInAEL;

      if (next !== null) {
        next.prevInAEL = edge2;
      }

      prev = edge2.prevInAEL;

      if (prev !== null) {
        prev.nextInAEL = edge1;
      }

      edge1.updateAEL(prev, edge2);
      edge2.updateAEL(edge1, next);
    } else {
      next = edge1.nextInAEL;
      prev = edge1.prevInAEL;
      edge1.nextInAEL = edge2.nextInAEL;

      if (edge1.nextInAEL !== null) {
        edge1.nextInAEL.prevInAEL = edge1;
      }

      edge1.prevInAEL = edge2.prevInAEL;

      if (edge1.prevInAEL !== null) {
        edge1.prevInAEL.nextInAEL = edge1;
      }

      edge2.nextInAEL = next;

      if (edge2.nextInAEL !== null) {
        edge2.nextInAEL.prevInAEL = edge2;
      }

      edge2.prevInAEL = prev;

      if (edge2.prevInAEL !== null) {
        edge2.prevInAEL.nextInAEL = edge2;
      }
    }

    if (edge1.prevInAEL === null) {
      this._source = edge1;
    } else if (edge2.prevInAEL === null) {
      this._source = edge2;
    }
  }

  public update(edge: TEdge, scabeam: ScanbeamStore): TEdge {
    if (edge.nextInLML === null) {
      console.error("UpdateEdgeIntoAEL: invalid call");
    }

    const prev: TEdge = edge.prevInAEL;
    const next: TEdge = edge.nextInAEL;

    edge.nextInLML.outIndex = edge.outIndex;

    if (prev !== null) {
      prev.nextInAEL = edge.nextInLML;
    } else {
      this._source = edge.nextInLML;
    }

    if (next !== null) {
      next.prevInAEL = edge.nextInLML;
    }

    edge.nextInLML.side = edge.side;
    edge.nextInLML.windDelta = edge.windDelta;
    edge.nextInLML.windCount1 = edge.windCount1;
    edge.nextInLML.windCnt2 = edge.windCnt2;
    edge = edge.nextInLML;
    edge.current.set(edge.bottom);
    edge.updateAEL(prev, next);

    if (!edge.isHorizontal) {
      scabeam.insert(edge.top.y);
    }

    return edge;
  }

  public delete(edge: TEdge): void {
    const prev: TEdge = edge.prevInAEL;
    const next: TEdge = edge.nextInAEL;

    if (prev === null && next === null && edge !== this._source) {
      return;
    }
    //already deleted
    if (prev !== null) {
      prev.nextInAEL = next;
    } else {
      this._source = next;
    }

    if (next !== null) {
      next.prevInAEL = prev;
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
