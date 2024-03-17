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

  public get edgesAdjacent(): boolean {
    return (
      this.Edge1.NextInSEL == this.Edge2 || this.Edge1.PrevInSEL == this.Edge2
    );
  }

  public static compare(node1: IntersectNode, node2: IntersectNode): number {
    return node2.Pt.Y - node1.Pt.Y;
  }
}
