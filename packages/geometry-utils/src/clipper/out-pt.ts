import { Point } from '../types';
import { PointI32 } from '../geometry';
export default class OutPt {
    public readonly point: Point<Int32Array>;

    public current: number;

    constructor(index: number, point: Point<Int32Array>) {
        this.point = PointI32.from(point);
        this.current = index;
    }
}
