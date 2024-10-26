import TEdge from './t-edge';
import { IntPoint } from './types';

export default class IntersectNode {
    public Edge1: TEdge;
    public Edge2: TEdge;
    public Pt: IntPoint;

    constructor() {
        this.Edge1 = null;
        this.Edge2 = null;
        this.Pt = { X: 0, Y: 0 };
    }
}
