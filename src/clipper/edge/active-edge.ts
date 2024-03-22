import PointRecord from "../point-record";
import ScanbeamStore from "../scanbeam-store";
import TEdge from "./t-edge";

export default class ActiveEdge {
  private _source: TEdge | null = null;

  public insert(edge1: TEdge, edge2: TEdge | null = null): void {
    let edge: TEdge | null = edge2;

    if (this.isEmpty) {
      edge1.ael.clean();
      this._source = edge1;
    } else if (
      edge === null &&
      TEdge.e2InsertsBeforeE1(this.unsfeSource, edge1)
    ) {
      edge1.ael.update(null, this._source);
      this.unsfeSource.ael.prev = edge1;
      this._source = edge1;
    } else {
      if (edge === null) {
        edge = this._source;
      }

      while (
        edge !== null &&
        edge.ael.hasNext &&
        !TEdge.e2InsertsBeforeE1(edge.ael.unsafeNext, edge1)
      ) {
        edge = edge.ael.next;
      }

      if (edge === null) {
        return;
      }

      edge1.ael.next = edge.ael.next;

      if (edge.ael.hasNext) {
        edge.ael.unsafeNext.ael.prev = edge1;
      }

      edge1.ael.prev = edge;
      edge.ael.next = edge1;
    }
  }

  public swap(edge1: TEdge, edge2: TEdge): void {
    //check that one or other edge hasn't already been removed from AEL ...
    if (edge1.ael.isLooped || edge2.ael.isLooped) {
      return;
    }

    let next: TEdge | null;
    let prev: TEdge | null;
    let record: PointRecord<TEdge>;

    if (edge1.ael.next == edge2) {
      record = edge2.ael;
      next = record.next;

      if (record.hasNext) {
        record.unsafeNext.ael.prev = edge1;
      }

      record = edge1.ael;
      prev = record.prev;

      if (record.hasPrev) {
        record.unsafePev.ael.next = edge2;
      }

      edge1.ael.update(edge2, next);
      edge2.ael.update(prev, edge1);
    } else if (edge2.ael.next == edge1) {
      record = edge1.ael;
      next = record.next;

      if (record.hasNext) {
        record.unsafeNext.ael.prev = edge2;
      }

      record = edge2.ael;
      prev = record.prev;

      if (record.hasPrev) {
        record.unsafePev.ael.next = edge1;
      }

      edge1.ael.update(prev, edge2);
      edge2.ael.update(edge1, next);
    } else {
      record = edge1.ael;
      next = record.next;
      prev = record.prev;

      record.next = edge2.ael.next;

      if (record.hasNext) {
        record.unsafeNext.ael.prev = edge1;
      }

      record.prev = edge2.ael.prev;

      if (record.hasPrev) {
        record.unsafePev.ael.next = edge1;
      }

      record = edge2.ael;
      record.next = next;

      if (record.hasNext) {
        record.unsafeNext.ael.prev = edge2;
      }

      record.prev = prev;

      if (record.hasPrev) {
        record.unsafePev.ael.next = edge2;
      }
    }

    if (!edge1.ael.hasPrev) {
      this._source = edge1;
    } else if (!edge2.ael.hasPrev) {
      this._source = edge2;
    }
  }

  public update(edge: TEdge, scabeam: ScanbeamStore): TEdge | null {
    if (edge.nextInLML === null) {
      console.error("UpdateEdgeIntoAEL: invalid call");

      return null;
    }

    const prev: TEdge | null = edge.ael.prev;
    const next: TEdge | null = edge.ael.next;

    edge.nextInLML.index = edge.index;

    if (edge.ael.hasPrev) {
      edge.ael.unsafePev.ael.next = edge.nextInLML;
    } else {
      this._source = edge.nextInLML;
    }

    if (edge.ael.hasNext) {
      edge.ael.unsafeNext.ael.prev = edge.nextInLML;
    }

    edge.nextInLML.side = edge.side;
    edge.nextInLML.windDelta = edge.windDelta;
    edge.nextInLML.windCount1 = edge.windCount1;
    edge.nextInLML.windCnt2 = edge.windCnt2;
    edge = edge.nextInLML;
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

    if (edge.ael.hasPrev) {
      edge.ael.unsafePev.ael.next = next;
    } else {
      this._source = next;
    }

    if (edge.ael.hasNext) {
      edge.ael.unsafeNext.ael.prev = prev;
    }

    edge.ael.update(null, null);
  }

  public clean(): void {
    this._source = null;
  }

  public get unsfeSource(): TEdge {
    return this._source as TEdge;
  }

  public get source(): TEdge | null {
    return this._source;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
