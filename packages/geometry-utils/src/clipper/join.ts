import { PointI32 } from '../geometry';
import OutPt, { OutPtRec } from './out-pt';
import { NullPtr } from './types';
import { Point } from 'src/types';
export default class Join {
    public index1: number;
    public index2: number;
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: Point<Int32Array>;

    constructor(outPtRec1: OutPtRec, outPtRec2: OutPtRec, offPoint: NullPtr<Point<Int32Array>>) {
        this.OutPt1 = outPtRec1.outPt;
        this.OutPt2 = outPtRec2.outPt;
        this.index1 = outPtRec1.index;
        this.index2 = outPtRec2.index;
        this.OffPt = PointI32.from(offPoint);
    }
}
