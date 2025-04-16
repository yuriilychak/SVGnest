import PointF64 from '../point/point-f64';
import TEdge from './t-edge';
import { NullPtr } from './types';

export default class IntersectNode {
    public Edge1: TEdge;
    public Edge2: TEdge;
    public Pt: PointF64;

    constructor(edge1: NullPtr<TEdge> = null, edge2: NullPtr<TEdge> = null, point: NullPtr<PointF64> = null) {
        this.Edge1 = edge1;
        this.Edge2 = edge2;
        this.Pt = PointF64.from(point);
    }

    public get edgesAdjacent(): boolean {
        return this.Edge1.NextInSEL === this.Edge2 || this.Edge1.PrevInSEL === this.Edge2;
    }

    public static sort(node1: IntersectNode, node2: IntersectNode): number {
        //the following typecast is safe because the differences in Pt.Y will
        //be limited to the height of the scanbeam.
        return node2.Pt.y - node1.Pt.y;
    }
}
