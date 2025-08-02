import { PointI32 } from '../geometry';
import { HORIZONTAL, UNASSIGNED } from './constants';
import { clipperRound } from '../helpers';
import { POLY_TYPE, POLY_FILL_TYPE, CLIP_TYPE, DIRECTION } from './types';
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



    public reset(side: DIRECTION): void {
        this.curr.update(this.bot);
        this.side = side;
        this.index = UNASSIGNED;
    }

    public topX(y: number): number {
        //if (edge.Bot === edge.Curr) alert ("edge.Bot = edge.Curr");
        //if (edge.Bot === edge.Top) alert ("edge.Bot = edge.Top");
        return y === this.top.y ? this.top.x : this.bot.x + clipperRound(this.dx * (y - this.bot.y));
    }

    public getWndTypeFilled(fillType: POLY_FILL_TYPE): number {
        switch (fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                return this.windCount1;
            case POLY_FILL_TYPE.NEGATIVE:
                return -this.windCount1;
            default:
                return Math.abs(this.windCount1);
        }
    }

    public get isFilled(): boolean {
        return this.isAssigned && !this.isWindDeletaEmpty;
    }

    public get isHorizontal(): boolean {
        return this.delta.y === 0;
    }

    public get isWindDeletaEmpty(): boolean {
        return this.windDelta === 0;
    }

    public get isDxHorizontal(): boolean {
        return this.dx === HORIZONTAL;
    }

    public unassign(): void {
        this.index = UNASSIGNED;
    }

    public get isAssigned(): boolean {
        return this.index !== UNASSIGNED;
    }
}
