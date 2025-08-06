import { Point } from '../types';
import { PointI32 } from '../geometry';
import { UNASSIGNED } from './constants';
export default class OutPt {
    public readonly point: Point<Int32Array>;

    public next: number;

    public prev: number;

    public current: number;

    constructor(index: number, point: Point<Int32Array>) {
        this.point = PointI32.from(point);
        this.next = UNASSIGNED;
        this.prev = UNASSIGNED;
        this.current = index;
    }
}
