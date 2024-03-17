import IntersectNode from "./intersect-node";
import TEdge from "./t-edge";

export default class SortedEdge {
  private _source: TEdge = null;

  //SEL pointers in PEdge are reused to build a list of horizontal edges.
  //However, we don't need to worry about order with horizontal edge processing.
  public add(edge: TEdge): void {
    edge.PrevInSEL = null;
    edge.NextInSEL = this._source;

    if (edge.NextInSEL !== null) {
      edge.NextInSEL.PrevInSEL = edge;
    }

    this._source = edge;
  }

  public delete(edge: TEdge): void {
    const prevSEL: TEdge = edge.PrevInSEL;
    const nextSEL: TEdge = edge.NextInSEL;

    if (prevSEL === null && nextSEL === null && edge !== this._source) {
      return;
    }

    //already deleted
    if (prevSEL !== null) {
      prevSEL.NextInSEL = nextSEL;
    } else {
      this._source = nextSEL;
    }
    if (nextSEL !== null) {
      nextSEL.PrevInSEL = prevSEL;
    }

    edge.NextInSEL = null;
  }

  public swap(node: IntersectNode): void {
    const edge1: TEdge = node.Edge1;
    const edge2: TEdge = node.Edge2;

    if (
      (edge1.NextInSEL === null && edge1.PrevInSEL === null) ||
      (edge2.NextInSEL === null && edge2.PrevInSEL === null)
    ) {
      return;
    }

    let next: TEdge;
    let prev: TEdge;

    if (edge1.NextInSEL == edge2) {
      next = edge2.NextInSEL;

      if (next !== null) {
        next.PrevInSEL = edge1;
      }

      prev = edge1.PrevInSEL;

      if (prev !== null) {
        prev.NextInSEL = edge2;
      }

      edge2.PrevInSEL = prev;
      edge2.NextInSEL = edge1;
      edge1.PrevInSEL = edge2;
      edge1.NextInSEL = next;
    } else if (edge2.NextInSEL == edge1) {
      next = edge1.NextInSEL;

      if (next !== null) {
        next.PrevInSEL = edge2;
      }

      prev = edge2.PrevInSEL;

      if (prev !== null) {
        prev.NextInSEL = edge1;
      }

      edge1.PrevInSEL = prev;
      edge1.NextInSEL = edge2;
      edge2.PrevInSEL = edge1;
      edge2.NextInSEL = next;
    } else {
      next = edge1.NextInSEL;
      prev = edge1.PrevInSEL;
      edge1.NextInSEL = edge2.NextInSEL;

      if (edge1.NextInSEL !== null) {
        edge1.NextInSEL.PrevInSEL = edge1;
      }

      edge1.PrevInSEL = edge2.PrevInSEL;

      if (edge1.PrevInSEL !== null) {
        edge1.PrevInSEL.NextInSEL = edge1;
      }

      edge2.NextInSEL = next;

      if (edge2.NextInSEL !== null) {
        edge2.NextInSEL.PrevInSEL = edge2;
      }

      edge2.PrevInSEL = prev;

      if (edge2.PrevInSEL !== null) {
        edge2.PrevInSEL.NextInSEL = edge2;
      }
    }

    if (edge1.PrevInSEL === null) {
      this._source = edge1;
    } else if (edge2.PrevInSEL === null) {
      this._source = edge2;
    }
  }

  public clean(): void {
    this._source = null;
  }

  public get source(): TEdge {
    return this._source;
  }

  public set source(value: TEdge) {
    this._source = value;
  }

  public get isEmpty(): boolean {
    return this._source === null;
  }
}
