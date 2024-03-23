import IntersectNode from "../intersect-node";
import PointRecord from "../point-record";
import TEdge from "./t-edge";

export default class SortedEdge {
  private _source: TEdge | null = null;

  //SEL pointers in PEdge are reused to build a list of horizontal edges.
  //However, we don't need to worry about order with horizontal edge processing.
  public add(edge: TEdge): void {
    edge.sel.update(null, this._source);

    if (edge.sel.hasNext) {
      edge.sel.unsafeNext.sel.prev = edge;
    }

    this._source = edge;
  }

  public update(edge: TEdge | null, topY: number = Number.NaN): TEdge | null {
    this._source = edge;

    const isUpdateX: boolean = !Number.isNaN(topY);
    let result: TEdge | null = edge;

    while (result !== null) {
      result.sel.update(result.ael.prev, result.ael.next);

      if (isUpdateX) {
        result.x = result.topX(topY);
      }

      result = result.ael.next;
    }

    return result;
  }

  public delete(edge: TEdge): void {
    if (edge.sel.isEmpty && edge !== this._source) {
      return;
    }

    const record: PointRecord<TEdge> = edge.sel;
    const prev: TEdge | null = record.prev;
    const next: TEdge | null = record.next;

    //already deleted
    if (record.hasPrev) {
      record.unsafePev.sel.next = next;
    } else {
      this._source = next;
    }

    if (edge.sel.hasNext) {
      record.unsafeNext.sel.prev = prev;
    }

    record.next = null;
  }

  public swap(node: IntersectNode): void {
    const edge1: TEdge = node.edge1;
    const edge2: TEdge = node.edge2;

    if (edge1.sel.isEmpty || edge2.sel.isEmpty) {
      return;
    }

    let next: TEdge | null;
    let prev: TEdge | null;
    let record: PointRecord<TEdge>;

    if (edge1.sel.next === edge2) {
      record = edge2.sel;
      next = record.next;

      if (record.hasNext) {
        record.unsafeNext.sel.prev = edge1;
      }

      record = edge1.sel;
      prev = record.prev;

      if (record.hasPrev) {
        record.unsafePev.sel.next = edge2;
      }

      edge1.sel.update(edge2, next);
      edge2.sel.update(prev, edge1);
    } else if (edge2.sel.next == edge1) {
      record = edge1.sel;
      next = record.next;

      if (record.hasNext) {
        record.unsafeNext.sel.prev = edge2;
      }

      record = edge2.sel;
      prev = record.prev;

      if (record.hasPrev) {
        record.unsafePev.sel.next = edge1;
      }

      edge1.sel.update(prev, edge2);
      edge2.sel.update(edge1, next);
    } else {
      record = edge1.sel;
      next = record.next;
      prev = record.prev;
      edge1.sel.next = edge2.sel.next;

      if (record.hasNext) {
        record.unsafeNext.sel.prev = edge1;
      }

      record.prev = edge2.sel.prev;

      if (record.hasPrev) {
        record.unsafePev.sel.next = edge1;
      }

      record = edge2.sel;
      record.next = next;

      if (record.hasNext) {
        record.unsafeNext.sel.prev = edge2;
      }

      record.prev = prev;

      if (record.hasPrev) {
        record.unsafePev.sel.next = edge2;
      }
    }

    if (!edge1.sel.hasPrev) {
      this._source = edge1;
    } else if (!edge2.sel.hasPrev) {
      this._source = edge2;
    }
  }

  public clean(): void {
    this._source = null;
  }

  public get unsafeSource(): TEdge {
    return this._source as TEdge;
  }

  public get source(): TEdge | null {
    return this._source;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
