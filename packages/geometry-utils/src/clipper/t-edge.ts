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
    public current: number;

    constructor(curr: Point<Int32Array>, polyType: POLY_TYPE, current: number) {
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
        this.current = current;
    }

    public reverseHorizontal(): void {
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        const tmp: number = this.top.x;
        this.top.x = this.bot.x;
        this.bot.x = tmp;
    }

    public reset(side: DIRECTION): void {
        this.curr.update(this.bot);
        this.side = side;
        this.unassign();
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

    public getContributing(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE): boolean {
        const isReverse: boolean = clipType === CLIP_TYPE.DIFFERENCE && this.polyTyp === POLY_TYPE.CLIP;

        switch (fillType) {
            case POLY_FILL_TYPE.NON_ZERO:
                return Math.abs(this.windCount1) === 1 && isReverse !== (this.windCount2 === 0);
            case POLY_FILL_TYPE.POSITIVE:
                return this.windCount1 === 1 && isReverse !== this.windCount2 <= 0;
            default:
                return this.windCount1 === UNASSIGNED && isReverse !== this.windCount2 >= 0;
        }
    }

    public unassign(): void {
        this.index = UNASSIGNED;
    }

    public get horzDirection(): Float64Array {
        return new Float64Array(
            this.bot.x < this.top.x ? [DIRECTION.RIGHT, this.bot.x, this.top.x] : [DIRECTION.LEFT, this.top.x, this.bot.x]
        );
    }

    public get isAssigned(): boolean {
        return this.index !== UNASSIGNED;
    }
}
