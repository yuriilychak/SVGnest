import { PointI32 } from '../geometry';
import TEdge from './t-edge';

export default class IntersectNode {
    public edge1: TEdge;
    public edge2: TEdge;
    public point: PointI32;

    constructor(edge1: TEdge, edge2: TEdge, point: PointI32) {
        this.edge1 = edge1;
        this.edge2 = edge2;
        this.point = PointI32.from(point);
    }
}
