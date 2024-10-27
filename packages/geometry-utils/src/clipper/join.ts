import OutPt from './out-pt';
import { IntPoint } from './types';

export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: IntPoint;

    constructor(outPt1: OutPt | null = null, outPt2: OutPt | null = null, offPoint: IntPoint | null = null) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = offPoint === null ? { X: 0, Y: 0 } : { X: offPoint.X, Y: offPoint.Y };
    }
}
