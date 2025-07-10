import { PointI32 } from '../geometry';
import OutPt, { OutPtRec } from './out-pt';
import { NullPtr } from './types';
import { Point } from 'src/types';
export default class Join {
    public index1: number;
    public index2: number;
    public outPt1: OutPt;
    public outPt2: OutPt;
    public offPoint: Point<Int32Array>;

    constructor(outPtRec1: OutPtRec, outPtRec2: OutPtRec, offPoint: NullPtr<Point<Int32Array>>) {
        this.outPt1 = outPtRec1.outPt;
        this.outPt2 = outPtRec2.outPt;
        this.index1 = outPtRec1.index;
        this.index2 = outPtRec2.index;
        this.offPoint = PointI32.from(offPoint);
    }
}
