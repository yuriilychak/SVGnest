import OutPt from './out-pt';
import { IntPoint } from './types';

export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: IntPoint;

    constructor() {
        this.OutPt1 = null;
        this.OutPt2 = null;
        this.OffPt = { X: 0, Y: 0 };
    }
}
