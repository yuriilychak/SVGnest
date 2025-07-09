import { PointI32 } from '../geometry';
import OutPt from './out-pt';
import { NullPtr } from './types';
import { Point } from 'src/types';
export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: Point<Int32Array>;

    constructor(outPt1: NullPtr<OutPt>, outPt2: NullPtr<OutPt>, offPoint: NullPtr<Point<Int32Array>>) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = PointI32.from(offPoint);
    }
}
