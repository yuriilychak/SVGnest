import IntersectNode from "../intersect-node";
import TEdge from "./t-edge";

export default class SortedEdge {
  private _source: TEdge = null;

  //SEL pointers in PEdge are reused to build a list of horizontal edges.
  //However, we don't need to worry about order with horizontal edge processing.
  public add(edge: TEdge): void {
    edge.updateSEL(null, this._source);

    if (edge.sel.next !== null) {
      edge.sel.next.sel.prev = edge;
    }

    this._source = edge;
  }

  public update(edge: TEdge, topY: number = Number.NaN): TEdge {
    this._source = edge;

    const isUpdateX: boolean = !Number.isNaN(topY);
    let result: TEdge = edge;

    while (result !== null) {
      result.updateSEL(result.prevInAEL, result.nextInAEL);

      if (isUpdateX) {
        result.x = result.topX(topY);
      }

      result = result.nextInAEL;
    }

    return result;
  }

  public delete(edge: TEdge): void {
    const prevSEL: TEdge = edge.sel.prev;
    const nextSEL: TEdge = edge.sel.next;

    if (prevSEL === null && nextSEL === null && edge !== this._source) {
      return;
    }

    //already deleted
    if (prevSEL !== null) {
      prevSEL.sel.next = nextSEL;
    } else {
      this._source = nextSEL;
    }

    if (nextSEL !== null) {
      nextSEL.sel.prev = prevSEL;
    }

    edge.sel.next = null;
  }

  public swap(node: IntersectNode): void {
    const edge1: TEdge = node.edge1;
    const edge2: TEdge = node.edge2;

    if (
      (edge1.sel.next === null && edge1.sel.prev === null) ||
      (edge2.sel.next === null && edge2.sel.prev === null)
    ) {
      return;
    }

    let next: TEdge;
    let prev: TEdge;

    if (edge1.sel.next == edge2) {
      next = edge2.sel.next;

      if (next !== null) {
        next.sel.prev = edge1;
      }

      prev = edge1.sel.prev;

      if (prev !== null) {
        prev.sel.next = edge2;
      }

      edge1.updateSEL(edge2, next);
      edge2.updateSEL(prev, edge1);
    } else if (edge2.sel.next == edge1) {
      next = edge1.sel.next;

      if (next !== null) {
        next.sel.prev = edge2;
      }

      prev = edge2.sel.prev;

      if (prev !== null) {
        prev.sel.next = edge1;
      }

      edge1.updateSEL(prev, edge2);
      edge2.updateSEL(edge1, next);
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

    if (edge1.sel.prev === null) {
      this._source = edge1;
    } else if (edge2.sel.prev === null) {
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
