import IntPoint from "./int-point";
import TEdge from "./edge/t-edge";

export default class IntersectNode {
  private _edge1: TEdge;
  private _edge2: TEdge;
  private _point: IntPoint;

  constructor(edge1: TEdge, edge2: TEdge, point: IntPoint) {
    this._edge1 = edge1;
    this._edge2 = edge2;
    this._point = IntPoint.from(point);
  }

  public get edgesAdjacent(): boolean {
    return (
      this._edge1.nextInSEL == this._edge2 ||
      this._edge1.prevInSEL == this._edge2
    );
  }

  public get edge1(): TEdge {
    return this._edge1;
  }

  public get edge2(): TEdge {
    return this._edge2;
  }

  public get point(): IntPoint {
    return this._point;
  }

  public static compare(node1: IntersectNode, node2: IntersectNode): number {
    return node2.point.y - node1.point.y;
  }
}
