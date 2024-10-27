import TEdge from './t-edge';
import { IntPoint } from './types';

export default class IntersectNode {
    public Edge1: TEdge;
    public Edge2: TEdge;
    public Pt: IntPoint;

    constructor(edge1: TEdge | null = null, edge2: TEdge | null = null, point: IntPoint | null = null) {
        this.Edge1 = edge1;
        this.Edge2 = edge2;
        this.Pt = point === null ? { X: 0, Y: 0 } : { X: point.X, Y: point.Y };
    }

    public get edgesAdjacent(): boolean {
        return this.Edge1.NextInSEL === this.Edge2 || this.Edge1.PrevInSEL === this.Edge2;
    }
}
