import ScanbeamStore from "../scanbeam-store";
import TEdge from "./t-edge";

export default class ActiveEdge {
  private _source: TEdge | null = null;

  public insert(edge: TEdge, startEdge: TEdge | null = null): void {
    if (this._source === null) {
      edge.ael.clean();
      this._source = edge;
    } else if (
      startEdge === null &&
      TEdge.e2InsertsBeforeE1(this._source, edge)
    ) {
      edge.ael.update(null, this._source);
      this._source.ael.prev = edge;
      this._source = edge;
    } else {
      if (startEdge === null) {
        startEdge = this._source;
      }

      while (
        startEdge.ael.next !== null &&
        !TEdge.e2InsertsBeforeE1(startEdge.ael.next, edge)
      ) {
        startEdge = startEdge.ael.next;
      }

      edge.ael.next = startEdge.ael.next;

      if (startEdge.ael.next !== null) {
        startEdge.ael.next.ael.prev = edge;
      }

      edge.ael.prev = startEdge;
      startEdge.ael.next = edge;
    }
  }

  public swap(edge1: TEdge, edge2: TEdge): void {
    //check that one or other edge hasn't already been removed from AEL ...
    if (edge1.ael.isLooped || edge2.ael.isLooped) {
      return;
    }

    let next: TEdge | null = null;
    let prev: TEdge | null = null;

    if (edge1.ael.next == edge2) {
      next = edge2.ael.next;

      if (next !== null) {
        next.ael.prev = edge1;
      }

      prev = edge1.ael.prev;

      if (prev !== null) {
        prev.ael.next = edge2;
      }

      edge1.ael.update(edge2, next);
      edge2.ael.update(prev, edge1);
    } else if (edge2.ael.next == edge1) {
      next = edge1.ael.next;

      if (next !== null) {
        next.ael.prev = edge2;
      }

      prev = edge2.ael.prev;

      if (prev !== null) {
        prev.ael.next = edge1;
      }

      edge1.ael.update(prev, edge2);
      edge2.ael.update(edge1, next);
    } else {
      next = edge1.ael.next;
      prev = edge1.ael.prev;
      edge1.ael.next = edge2.ael.next;

      if (edge1.ael.next !== null) {
        edge1.ael.next.ael.prev = edge1;
      }

      edge1.ael.prev = edge2.ael.prev;

      if (edge1.ael.prev !== null) {
        edge1.ael.prev.ael.next = edge1;
      }

      edge2.ael.next = next;

      if (edge2.ael.next !== null) {
        edge2.ael.next.ael.prev = edge2;
      }

      edge2.ael.prev = prev;

      if (edge2.ael.prev !== null) {
        edge2.ael.prev.ael.next = edge2;
      }
    }

    if (!edge1.ael.hasPrev) {
      this._source = edge1;
    } else if (!edge2.ael.hasPrev) {
      this._source = edge2;
    }
  }

  public update(edge: TEdge, scabeam: ScanbeamStore): TEdge {
    if (edge.nextInLML === null) {
      console.error("UpdateEdgeIntoAEL: invalid call");
    }

    const prev: TEdge | null = edge.ael.prev;
    const next: TEdge | null = edge.ael.next;
    const nextInLML: TEdge = edge.nextInLML as TEdge;

    nextInLML.outIndex = edge.outIndex;

    if (prev !== null) {
      prev.ael.next = nextInLML;
    } else {
      this._source = nextInLML;
    }

    if (next !== null) {
      next.ael.prev = nextInLML;
    }

    nextInLML.side = edge.side;
    nextInLML.windDelta = edge.windDelta;
    nextInLML.windCount1 = edge.windCount1;
    nextInLML.windCnt2 = edge.windCnt2;
    edge = nextInLML;
    edge.set(edge.bottom);
    edge.ael.update(prev, next);

    if (!edge.isHorizontalY) {
      scabeam.insert(edge.top.y);
    }

    return edge;
  }

  public delete(edge: TEdge): void {
    if (edge.ael.isEmpty && edge !== this._source) {
      return;
    }

    const prev: TEdge | null = edge.ael.prev;
    const next: TEdge | null = edge.ael.next;
    //already deleted

    if (prev !== null) {
      prev.ael.next = next;
    } else {
      this._source = next;
    }

    if (next !== null) {
      next.ael.prev = prev;
    }

    edge.ael.update(null, null);
  }

  public clean(): void {
    this._source = null;
  }

  public get source(): TEdge | null {
    return this._source;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
