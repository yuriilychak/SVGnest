import { Point } from "../geom";
import TEdge from "./edge/t-edge";

export default class IntersectNode extends Point {
  private _edge1: TEdge;
  private _edge2: TEdge;

  constructor(edge1: TEdge, edge2: TEdge, point: Point) {
    super();
    this.set(point);
    this._edge1 = edge1;
    this._edge2 = edge2;
  }

  public get edgesAdjacent(): boolean {
    return (
      this._edge1.sel.next == this._edge2 || this._edge1.sel.prev == this._edge2
    );
  }

  public get edge1(): TEdge {
    return this._edge1;
  }

  public get edge2(): TEdge {
    return this._edge2;
  }

  public static compare(node1: IntersectNode, node2: IntersectNode): f64 {
    return node2.y - node1.y;
  }
}
