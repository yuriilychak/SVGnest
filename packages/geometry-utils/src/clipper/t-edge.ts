import { PointI32 } from '../geometry';
import { POLY_TYPE, DIRECTION } from './types';
import { Point } from '../types';

export default class TEdge {
    public bot: Point<Int32Array>;
    public curr: Point<Int32Array>;
    public top: Point<Int32Array>;
    public delta: Point<Int32Array>;
    public polyTyp: POLY_TYPE;
    public side: DIRECTION;

    constructor(curr: Point<Int32Array>, polyType: POLY_TYPE) {
        this.bot = PointI32.create();
        this.curr = PointI32.from(curr);
        this.top = PointI32.create();
        this.delta = PointI32.create();
        this.polyTyp = polyType;
        this.side = DIRECTION.LEFT;
    }
}
