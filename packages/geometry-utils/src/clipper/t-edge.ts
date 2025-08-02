import { PointI32 } from '../geometry';
import { UNASSIGNED } from './constants';
import { POLY_TYPE, DIRECTION } from './types';
import { Point } from '../types';

export default class TEdge {
    public bot: Point<Int32Array>;
    public curr: Point<Int32Array>;
    public top: Point<Int32Array>;
    public delta: Point<Int32Array>;
    public dx: number;
    public polyTyp: POLY_TYPE;
    public side: DIRECTION;
    public windDelta: number;
    public windCount1: number;
    public windCount2: number;
    public index: number;

    constructor(curr: Point<Int32Array>, polyType: POLY_TYPE) {
        this.bot = PointI32.create();
        this.curr = PointI32.from(curr);
        this.top = PointI32.create();
        this.delta = PointI32.create();
        this.dx = 0;
        this.polyTyp = polyType;
        this.side = DIRECTION.LEFT;
        this.windDelta = 0;
        this.windCount1 = 0;
        this.windCount2 = 0;
        this.index = UNASSIGNED;
    }

    public unassign(): void {
        this.index = UNASSIGNED;
    }
}
