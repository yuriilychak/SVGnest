import IntersectNode from "../intersect-node";
import TEdge from "./t-edge";

export default class SortedEdge {
  private _source: TEdge | null = null;

  public add(edge: TEdge): void {
    edge.sel.update(null, this._source);

    if (edge.sel.next !== null) {
      edge.sel.next.sel.prev = edge;
    }

    this._source = edge;
  }

  public update(edge: TEdge, topY: f64 = Number.NaN): TEdge | null {
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

    const prev: TEdge | null = edge.sel.prev;
    const next: TEdge | null = edge.sel.next;

    //already deleted
    if (prev !== null) {
      prev.sel.next = next;
    } else {
      this._source = next;
    }

    if (next !== null) {
      next.sel.prev = prev;
    }

    edge.sel.next = null;
  }

  public swap(node: IntersectNode): void {
    const edge1: TEdge = node.edge1;
    const edge2: TEdge = node.edge2;

    if (edge1.sel.isEmpty || edge2.sel.isEmpty) {
      return;
    }

    let next: TEdge | null = null;
    let prev: TEdge | null = null;

    if (edge1.sel.next === edge2) {
      next = edge2.sel.next;

      if (next !== null) {
        next.sel.prev = edge1;
      }

      prev = edge1.sel.prev;

      if (prev !== null) {
        prev.sel.next = edge2;
      }

      edge1.sel.update(edge2, next);
      edge2.sel.update(prev, edge1);
    } else if (edge2.sel.next == edge1) {
      next = edge1.sel.next;

      if (next !== null) {
        next.sel.prev = edge2;
      }

      prev = edge2.sel.prev;

      if (prev !== null) {
        prev.sel.next = edge1;
      }

      edge1.sel.update(prev, edge2);
      edge2.sel.update(edge1, next);
    } else {
      next = edge1.sel.next;
      prev = edge1.sel.prev;
      edge1.sel.next = edge2.sel.next;

      if (edge1.sel.next !== null) {
        edge1.sel.next.sel.prev = edge1;
      }

      edge1.sel.prev = edge2.sel.prev;

      if (edge1.sel.prev !== null) {
        edge1.sel.prev.sel.next = edge1;
      }

      edge2.sel.next = next;

      if (edge2.sel.next !== null) {
        edge2.sel.next.sel.prev = edge2;
      }

      edge2.sel.prev = prev;

      if (edge2.sel.prev !== null) {
        edge2.sel.prev.sel.next = edge2;
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

  public get source(): TEdge | null {
    return this._source;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
