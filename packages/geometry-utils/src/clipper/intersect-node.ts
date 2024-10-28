import Point from '../point';
import TEdge from './t-edge';

export default class IntersectNode {
    public Edge1: TEdge;
    public Edge2: TEdge;
    public Pt: Point;

    constructor(edge1: TEdge | null = null, edge2: TEdge | null = null, point: Point | null = null) {
        this.Edge1 = edge1;
        this.Edge2 = edge2;
        this.Pt = point === null ? Point.zero() : Point.from(point);
    }

    public get edgesAdjacent(): boolean {
        return this.Edge1.NextInSEL === this.Edge2 || this.Edge1.PrevInSEL === this.Edge2;
    }
}
