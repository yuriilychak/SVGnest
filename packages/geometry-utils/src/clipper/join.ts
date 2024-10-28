import Point from '../point';
import OutPt from './out-pt';

export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: Point;

    constructor(outPt1: OutPt | null = null, outPt2: OutPt | null = null, offPoint: Point | null = null) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = offPoint === null ? Point.zero() : Point.from(offPoint);
    }
}
