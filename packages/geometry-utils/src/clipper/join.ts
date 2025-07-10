import { PointI32 } from '../geometry';
import { NullPtr } from './types';
import { Point } from '../types';
export default class Join {
    public outHash1: number;
    public outHash2: number;
    public offPoint: Point<Int32Array>;

    constructor(outHash1: number, outHash2: number, offPoint: NullPtr<Point<Int32Array>>) {
        this.outHash1 = outHash1;
        this.outHash2 = outHash2;
        this.offPoint = PointI32.from(offPoint);
    }
}
