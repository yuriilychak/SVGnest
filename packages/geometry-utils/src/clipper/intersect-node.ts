import { PointI32 } from '../geometry';

export default class IntersectNode {
    public edge1: number;
    public edge2: number;
    public point: PointI32;

    constructor(edge1: number, edge2: number, point: PointI32) {
        this.edge1 = edge1;
        this.edge2 = edge2;
        this.point = PointI32.from(point);
    }
}
