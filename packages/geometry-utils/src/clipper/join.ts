import OutPt from './out-pt';
import Point from './point';
import { IClipperPoint } from './types';

export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: IClipperPoint;

    constructor(outPt1: OutPt | null = null, outPt2: OutPt | null = null, offPoint: IClipperPoint | null = null) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = offPoint === null ? Point.zero() : Point.from(offPoint);
    }
}
