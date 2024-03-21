import IntersectNode from "../intersect-node";
import TEdge from "./t-edge";

export default class SortedEdge {
  private _source: TEdge = null;

  //SEL pointers in PEdge are reused to build a list of horizontal edges.
  //However, we don't need to worry about order with horizontal edge processing.
  public add(edge: TEdge): void {
    edge.sel.update(null, this._source);

    if (edge.sel.hasNext) {
      edge.sel.next.sel.prev = edge;
    }

    this._source = edge;
  }

  public update(edge: TEdge, topY: number = Number.NaN): TEdge {
    this._source = edge;

    const isUpdateX: boolean = !Number.isNaN(topY);
    let result: TEdge = edge;

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

    const prevSEL: TEdge = edge.sel.prev;
    const nextSEL: TEdge = edge.sel.next;

    //already deleted
    if (edge.sel.hasPrev) {
      prevSEL.sel.next = nextSEL;
    } else {
      this._source = nextSEL;
    }

    if (edge.sel.hasNext) {
      nextSEL.sel.prev = prevSEL;
    }

    edge.sel.next = null;
  }

  public swap(node: IntersectNode): void {
    const edge1: TEdge = node.edge1;
    const edge2: TEdge = node.edge2;

    if (edge1.sel.isEmpty || edge2.sel.isEmpty) {
      return;
    }

    let next: TEdge;
    let prev: TEdge;

    if (edge1.sel.next === edge2) {
      next = edge2.sel.next;

      if (edge2.sel.hasNext) {
        next.sel.prev = edge1;
      }

      prev = edge1.sel.prev;

      if (edge1.sel.hasPrev) {
        prev.sel.next = edge2;
      }

      edge1.sel.update(edge2, next);
      edge2.sel.update(prev, edge1);
    } else if (edge2.sel.next == edge1) {
      next = edge1.sel.next;

      if (edge1.sel.hasNext) {
        next.sel.prev = edge2;
      }

      prev = edge2.sel.prev;

      if (edge2.sel.hasPrev) {
        prev.sel.next = edge1;
      }

      edge1.sel.update(prev, edge2);
      edge2.sel.update(edge1, next);
    } else {
      next = edge1.sel.next;
      prev = edge1.sel.prev;
      edge1.sel.next = edge2.sel.next;

      if (edge1.sel.hasNext) {
        edge1.sel.next.sel.prev = edge1;
      }

      edge1.sel.prev = edge2.sel.prev;

      if (edge1.sel.hasPrev) {
        edge1.sel.prev.sel.next = edge1;
      }

      edge2.sel.next = next;

      if (edge2.sel.hasNext) {
        edge2.sel.next.sel.prev = edge2;
      }

      edge2.sel.prev = prev;

      if (edge2.sel.hasPrev) {
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

  public get source(): TEdge {
    return this._source;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
