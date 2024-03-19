import IntersectNode from "../intersect-node";
import TEdge from "./t-edge";

export default class SortedEdge {
  private _source: TEdge = null;

  //SEL pointers in PEdge are reused to build a list of horizontal edges.
  //However, we don't need to worry about order with horizontal edge processing.
  public add(edge: TEdge): void {
    edge.updateSEL(null, this._source);

    if (edge.nextInSEL !== null) {
      edge.nextInSEL.prevInSEL = edge;
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
        result.current.x = result.topX(topY);
      }

      result = result.nextInAEL;
    }

    return result;
  }

  public delete(edge: TEdge): void {
    const prevSEL: TEdge = edge.prevInSEL;
    const nextSEL: TEdge = edge.nextInSEL;

    if (prevSEL === null && nextSEL === null && edge !== this._source) {
      return;
    }

    //already deleted
    if (prevSEL !== null) {
      prevSEL.nextInSEL = nextSEL;
    } else {
      this._source = nextSEL;
    }

    if (nextSEL !== null) {
      nextSEL.prevInSEL = prevSEL;
    }

    edge.nextInSEL = null;
  }

  public swap(node: IntersectNode): void {
    const edge1: TEdge = node.edge1;
    const edge2: TEdge = node.edge2;

    if (
      (edge1.nextInSEL === null && edge1.prevInSEL === null) ||
      (edge2.nextInSEL === null && edge2.prevInSEL === null)
    ) {
      return;
    }

    let next: TEdge;
    let prev: TEdge;

    if (edge1.nextInSEL == edge2) {
      next = edge2.nextInSEL;

      if (next !== null) {
        next.prevInSEL = edge1;
      }

      prev = edge1.prevInSEL;

      if (prev !== null) {
        prev.nextInSEL = edge2;
      }

      edge1.updateSEL(edge2, next);
      edge2.updateSEL(prev, edge1);
    } else if (edge2.nextInSEL == edge1) {
      next = edge1.nextInSEL;

      if (next !== null) {
        next.prevInSEL = edge2;
      }

      prev = edge2.prevInSEL;

      if (prev !== null) {
        prev.nextInSEL = edge1;
      }

      edge1.updateSEL(prev, edge2);
      edge2.updateSEL(edge1, next);
    } else {
      next = edge1.nextInSEL;
      prev = edge1.prevInSEL;
      edge1.nextInSEL = edge2.nextInSEL;

      if (edge1.nextInSEL !== null) {
        edge1.nextInSEL.prevInSEL = edge1;
      }

      edge1.prevInSEL = edge2.prevInSEL;

      if (edge1.prevInSEL !== null) {
        edge1.prevInSEL.nextInSEL = edge1;
      }

      edge2.nextInSEL = next;

      if (edge2.nextInSEL !== null) {
        edge2.nextInSEL.prevInSEL = edge2;
      }

      edge2.prevInSEL = prev;

      if (edge2.prevInSEL !== null) {
        edge2.prevInSEL.nextInSEL = edge2;
      }
    }

    if (edge1.prevInSEL === null) {
      this._source = edge1;
    } else if (edge2.prevInSEL === null) {
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
