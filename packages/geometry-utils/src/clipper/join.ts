import { PointI32 } from '../geometry';
import { Point } from '../types';
export default class Join {
    public outHash1: number;
    public outHash2: number;
    public offPoint: Point<Int32Array>;

    constructor(outHash1: number, outHash2: number, x: number, y: number) {
        this.outHash1 = outHash1;
        this.outHash2 = outHash2;
        this.offPoint = PointI32.create(x, y);
    }
}
