import IntPoint from "./int-point";
import TEdge from "./t-edge";

export default class IntersectNode {
  public Edge1: TEdge;
  public Edge2: TEdge;
  public Pt: IntPoint;

  constructor(edge1: TEdge, edge2: TEdge, point: IntPoint) {
    this.Edge1 = edge1;
    this.Edge2 = edge2;
    this.Pt = IntPoint.from(point);
  }

  public swapPositionsInSEL(inputEdge: TEdge): TEdge {
    if (this.Edge1.NextInSEL === null && this.Edge1.PrevInSEL === null)
      return inputEdge;
    if (this.Edge2.NextInSEL === null && this.Edge2.PrevInSEL === null)
      return inputEdge;
    if (this.Edge1.NextInSEL == this.Edge2) {
      var next = this.Edge2.NextInSEL;
      if (next !== null) next.PrevInSEL = this.Edge1;
      var prev = this.Edge1.PrevInSEL;
      if (prev !== null) prev.NextInSEL = this.Edge2;
      this.Edge2.PrevInSEL = prev;
      this.Edge2.NextInSEL = this.Edge1;
      this.Edge1.PrevInSEL = this.Edge2;
      this.Edge1.NextInSEL = next;
    } else if (this.Edge2.NextInSEL == this.Edge1) {
      var next = this.Edge1.NextInSEL;
      if (next !== null) next.PrevInSEL = this.Edge2;
      var prev = this.Edge2.PrevInSEL;
      if (prev !== null) prev.NextInSEL = this.Edge1;
      this.Edge1.PrevInSEL = prev;
      this.Edge1.NextInSEL = this.Edge2;
      this.Edge2.PrevInSEL = this.Edge1;
      this.Edge2.NextInSEL = next;
    } else {
      var next = this.Edge1.NextInSEL;
      var prev = this.Edge1.PrevInSEL;
      this.Edge1.NextInSEL = this.Edge2.NextInSEL;
      if (this.Edge1.NextInSEL !== null)
        this.Edge1.NextInSEL.PrevInSEL = this.Edge1;
      this.Edge1.PrevInSEL = this.Edge2.PrevInSEL;
      if (this.Edge1.PrevInSEL !== null)
        this.Edge1.PrevInSEL.NextInSEL = this.Edge1;
      this.Edge2.NextInSEL = next;
      if (this.Edge2.NextInSEL !== null)
        this.Edge2.NextInSEL.PrevInSEL = this.Edge2;
      this.Edge2.PrevInSEL = prev;
      if (this.Edge2.PrevInSEL !== null)
        this.Edge2.PrevInSEL.NextInSEL = this.Edge2;
    }
    if (this.Edge1.PrevInSEL === null) return this.Edge1;
    else if (this.Edge2.PrevInSEL === null) return this.Edge2;

    return inputEdge;
  }

  public get edgesAdjacent(): boolean {
    return (
      this.Edge1.NextInSEL == this.Edge2 || this.Edge1.PrevInSEL == this.Edge2
    );
  }

  public static compare(node1: IntersectNode, node2: IntersectNode): number {
    return node2.Pt.Y - node1.Pt.Y;
  }
}
