import Point from '../point';
import { HORIZONTAL } from './constants';
import { slopesEqual } from '../helpers';
import { clipperRound } from '../helpers';
import { POLY_TYPE, POLY_FILL_TYPE, CLIP_TYPE, DIRECTION, NullPtr } from './types';

export default class TEdge {
    public Bot: Point;
    public Curr: Point;
    public Top: Point;
    public Delta: Point;
    public Dx: number;
    public PolyTyp: POLY_TYPE;
    public Side: DIRECTION;
    public WindDelta: number;
    public WindCnt: number;
    public WindCnt2: number;
    public index: number;
    public Next: TEdge;
    public Prev: TEdge;
    public NextInLML: TEdge;
    public NextInAEL: TEdge;
    public PrevInAEL: TEdge;
    public NextInSEL: TEdge;
    public PrevInSEL: TEdge;

    constructor() {
        this.Bot = Point.zero();
        this.Curr = Point.zero();
        this.Top = Point.zero();
        this.Delta = Point.zero();
        this.Dx = 0;
        this.PolyTyp = POLY_TYPE.SUBJECT;
        this.Side = DIRECTION.LEFT;
        this.WindDelta = 0;
        this.WindCnt = 0;
        this.WindCnt2 = 0;
        this.index = 0;
        this.Next = null;
        this.Prev = null;
        this.NextInLML = null;
        this.NextInAEL = null;
        this.PrevInAEL = null;
        this.NextInSEL = null;
        this.PrevInSEL = null;
    }

    public init(nextEdge: TEdge, prevEdge: TEdge, point: Point): void {
        this.Next = nextEdge;
        this.Prev = prevEdge;
        //e.Curr = pt;
        this.Curr.update(point);
        this.unassign();
    }

    public initFromPolyType(polyType: POLY_TYPE): void {
        if (this.Curr.y >= this.Next.Curr.y) {
            this.Bot.update(this.Curr);
            this.Top.update(this.Next.Curr);
        } else {
            this.Top.update(this.Curr);
            this.Bot.update(this.Next.Curr);
        }

        this.setDx();

        this.PolyTyp = polyType;
    }

    public remove(): TEdge {
        const result: TEdge = this.Next;
        //removes e from double_linked_list (but without removing from memory)
        this.Prev.Next = this.Next;
        this.Next.Prev = this.Prev;
        this.Prev = null; //flag as removed (see ClipperBase.Clear)
        this.Next = null;

        return result;
    }

    public reverseHorizontal(): void {
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        const tmp: number = this.Top.x;
        this.Top.x = this.Bot.x;
        this.Bot.x = tmp;
    }

    public findNextLocMin(): TEdge {
        let result: TEdge = this;
        let edge: TEdge = null;

        while (true) {
            while (!result.Bot.almostEqual(result.Prev.Bot) || result.Curr.almostEqual(result.Top)) {
                result = result.Next;
            }

            if (!result.isDxHorizontal && !result.Prev.isDxHorizontal) {
                break;
            }

            while (result.Prev.isDxHorizontal) {
                result = result.Prev;
            }

            edge = result;

            while (result.isDxHorizontal) {
                result = result.Next;
            }
            if (result.Top.y === result.Prev.Bot.y) {
                continue;
            }
            //ie just an intermediate horz.
            if (edge.Prev.Bot.x < result.Bot.x) {
                result = edge;
            }

            break;
        }

        return result;
    }

    public setDx(): void {
        this.Delta.update(this.Top).sub(this.Bot);
        this.Dx = this.Delta.y === 0 ? HORIZONTAL : this.Delta.x / this.Delta.y;
    }

    public reset(side: DIRECTION): void {
        this.Curr.update(this.Bot);
        this.Side = side;
        this.unassign();
    }

    public copyAELToSEL(): TEdge {
        this.PrevInSEL = this.PrevInAEL;
        this.NextInSEL = this.NextInAEL;

        return this.NextInAEL;
    }

    public topX(y: number): number {
        //if (edge.Bot === edge.Curr) alert ("edge.Bot = edge.Curr");
        //if (edge.Bot === edge.Top) alert ("edge.Bot = edge.Top");
        return y === this.Top.y ? this.Top.x : this.Bot.x + clipperRound(this.Dx * (y - this.Bot.y));
    }

    public deleteFromSEL(inputEdge: TEdge): NullPtr<TEdge> {
        if (this.PrevInSEL === null && this.NextInSEL === null && this !== inputEdge) {
            return inputEdge;
        }

        let result: TEdge = inputEdge;
        //already deleted
        if (this.PrevInSEL !== null) {
            this.PrevInSEL.NextInSEL = this.NextInSEL;
        } else {
            result = this.NextInSEL;
        }

        if (this.NextInSEL !== null) {
            this.NextInSEL.PrevInSEL = this.PrevInSEL;
        }

        this.NextInSEL = null;
        this.PrevInSEL = null;

        return result;
    }

    public deleteFromAEL(inputEdge: TEdge): NullPtr<TEdge> {
        if (this.PrevInAEL === null && this.NextInAEL === null && this !== inputEdge) {
            return inputEdge;
        }

        let result: TEdge = inputEdge;
        //already deleted
        if (this.PrevInAEL !== null) {
            this.PrevInAEL.NextInAEL = this.NextInAEL;
        } else {
            result = this.NextInAEL;
        }

        if (this.NextInAEL !== null) {
            this.NextInAEL.PrevInAEL = this.PrevInAEL;
        }

        this.NextInAEL = null;
        this.PrevInAEL = null;

        return result;
    }

    public getIntermediate(y: number): boolean {
        return this.Top.y === y && this.NextInLML !== null;
    }

    public get isFilled(): boolean {
        return this.isAssigned && !this.isWindDeletaEmpty;
    }

    public get isHorizontal(): boolean {
        return this.Delta.y === 0;
    }

    public get isWindDeletaEmpty(): boolean {
        return this.WindDelta === 0;
    }

    public get isDxHorizontal(): boolean {
        return this.Dx === HORIZONTAL;
    }

    public get maximaPair(): NullPtr<TEdge> {
        let result: NullPtr<TEdge> = null;

        if (this.Next !== null && this.Next.Top.almostEqual(this.Top) && this.Next.NextInLML === null) {
            result = this.Next;
        } else if (this.Prev !== null && this.Prev.Top.almostEqual(this.Top) && this.Prev.NextInLML === null) {
            result = this.Prev;
        }

        return result !== null && result.NextInAEL === result.PrevInAEL && !result.isHorizontal ? null : result;
    }

    public getMaxima(y: number): boolean {
        return this.Top.y === y && this.NextInLML === null;
    }

    public getContributing(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE): boolean {
        const isReverse: boolean = clipType === CLIP_TYPE.DIFFERENCE && this.PolyTyp === POLY_TYPE.CLIP;

        switch (fillType) {
            case POLY_FILL_TYPE.NON_ZERO:
                return Math.abs(this.WindCnt) === 1 && isReverse !== (this.WindCnt2 === 0);
            case POLY_FILL_TYPE.POSITIVE:
                return this.WindCnt === 1 && isReverse !== this.WindCnt2 <= 0;
            default:
                return this.WindCnt === -1 && isReverse !== this.WindCnt2 >= 0;
        }
    }

    public insertsBefore(edge: TEdge): boolean {
        if (this.Curr.x === edge.Curr.x) {
            return this.Top.y > edge.Top.y ? this.Top.x < edge.topX(this.Top.y) : edge.Top.x > this.topX(edge.Top.y);
        }

        return this.Curr.x < edge.Curr.x;
    }

    public addEdgeToSEL(sortedEdge: NullPtr<TEdge>): TEdge {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        this.PrevInSEL = null;
        this.NextInSEL = sortedEdge;

        if (sortedEdge !== null) {
            sortedEdge.PrevInSEL = this;
        }

        return this;
    }

    public insertEdgeIntoAEL(activeEdge: NullPtr<TEdge>, startEdge: NullPtr<TEdge> = null): TEdge {
        if (activeEdge === null) {
            this.PrevInAEL = null;
            this.NextInAEL = null;

            return this;
        }

        if (startEdge === null && this.insertsBefore(activeEdge)) {
            this.PrevInAEL = null;
            this.NextInAEL = activeEdge;
            activeEdge.PrevInAEL = this;

            return this;
        }

        let edge: TEdge = startEdge === null ? activeEdge : startEdge;

        while (edge.NextInAEL !== null && !this.insertsBefore(edge.NextInAEL)) {
            edge = edge.NextInAEL;
        }

        this.NextInAEL = edge.NextInAEL;

        if (edge.NextInAEL !== null) {
            edge.NextInAEL.PrevInAEL = this;
        }

        this.PrevInAEL = edge;
        edge.NextInAEL = this;

        return activeEdge;
    }

    public getNextInAEL(direction: DIRECTION): NullPtr<TEdge> {
        return direction === DIRECTION.RIGHT ? this.NextInAEL : this.PrevInAEL;
    }

    public unassign(): void {
        this.index = TEdge.UNASSIGNED;
    }

    public get horzDirection(): Float64Array {
        return new Float64Array(
            this.Bot.x < this.Top.x ? [DIRECTION.RIGHT, this.Bot.x, this.Top.x] : [DIRECTION.LEFT, this.Top.x, this.Bot.x]
        );
    }

    public get isAssigned(): boolean {
        return this.index !== TEdge.UNASSIGNED;
    }

    public setWindingCount(activeEdge: TEdge, clipType: CLIP_TYPE): void {
        let edge: NullPtr<TEdge> = this.PrevInAEL;
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (edge !== null && (edge.PolyTyp !== this.PolyTyp || edge.isWindDeletaEmpty)) {
            edge = edge.PrevInAEL;
        }

        if (edge === null) {
            this.WindCnt = this.isWindDeletaEmpty ? 1 : this.WindDelta;
            this.WindCnt2 = 0;
            edge = activeEdge;
            //ie get ready to calc WindCnt2
        } else if (this.isWindDeletaEmpty && clipType !== CLIP_TYPE.UNION) {
            this.WindCnt = 1;
            this.WindCnt2 = edge.WindCnt2;
            edge = edge.NextInAEL;
            //ie get ready to calc WindCnt2
        } else {
            //nonZero, Positive or Negative filling ...
            if (edge.WindCnt * edge.WindDelta < 0) {
                //prev edge is 'decreasing' WindCount (WC) toward zero
                //so we're outside the previous polygon ...
                if (Math.abs(edge.WindCnt) > 1) {
                    //outside prev poly but still inside another.
                    //when reversing direction of prev poly use the same WC
                    this.WindCnt = edge.WindDelta * this.WindDelta < 0 ? edge.WindCnt : edge.WindCnt + this.WindDelta;
                } else {
                    this.WindCnt = this.isWindDeletaEmpty ? 1 : this.WindDelta;
                }
            } else {
                //prev edge is 'increasing' WindCount (WC) away from zero
                //so we're inside the previous polygon ...
                if (this.isWindDeletaEmpty) {
                    this.WindCnt = edge.WindCnt < 0 ? edge.WindCnt - 1 : edge.WindCnt + 1;
                } else {
                    this.WindCnt = edge.WindDelta * this.WindDelta < 0 ? edge.WindCnt : edge.WindCnt + this.WindDelta;
                }
            }

            this.WindCnt2 = edge.WindCnt2;
            edge = edge.NextInAEL;
            //ie get ready to calc WindCnt2
        }
        //nonZero, Positive or Negative filling ...
        while (edge !== this) {
            this.WindCnt2 += edge.WindDelta;
            edge = edge.NextInAEL;
        }
    }

    public static intersectPoint(edge1: TEdge, edge2: TEdge, intersectPoint: Point, useFullRange: boolean): boolean {
        //nb: with very large coordinate values, it's possible for SlopesEqual() to
        //return false but for the edge.Dx value be equal due to double precision rounding.
        if (TEdge.slopesEqual(edge1, edge2, useFullRange) || edge1.Dx === edge2.Dx) {
            const point: Point = edge2.Bot.y > edge1.Bot.y ? edge2.Bot : edge1.Bot;

            intersectPoint.update(point);

            return false;
        }

        if (edge1.Delta.x === 0) {
            intersectPoint.set(
                edge1.Bot.x,
                edge2.isHorizontal ? edge2.Bot.y : clipperRound((edge1.Bot.x - edge2.Bot.x) / edge2.Dx + edge2.Bot.y)
            );
        } else if (edge2.Delta.x === 0) {
            intersectPoint.set(
                edge2.Bot.x,
                edge1.isHorizontal ? edge1.Bot.y : clipperRound((edge2.Bot.x - edge1.Bot.x) / edge1.Dx + edge1.Bot.y)
            );
        } else {
            const b1 = edge1.Bot.x - edge1.Bot.y * edge1.Dx;
            const b2 = edge2.Bot.x - edge2.Bot.y * edge2.Dx;
            const q: number = (b2 - b1) / (edge1.Dx - edge2.Dx);

            intersectPoint.set(
                Math.abs(edge1.Dx) < Math.abs(edge2.Dx) ? clipperRound(edge1.Dx * q + b1) : clipperRound(edge2.Dx * q + b2),
                clipperRound(q)
            );
        }

        if (intersectPoint.y < edge1.Top.y || intersectPoint.y < edge2.Top.y) {
            if (edge1.Top.y > edge2.Top.y) {
                intersectPoint.set(edge2.topX(edge1.Top.y), edge1.Top.y);

                return intersectPoint.x < edge1.Top.x;
            }

            intersectPoint.set(
                Math.abs(edge1.Dx) < Math.abs(edge2.Dx) ? edge1.topX(intersectPoint.y) : edge2.topX(intersectPoint.y),
                edge2.Top.y
            );
        }

        return true;
    }

    public static slopesEqual(e1: TEdge, e2: TEdge, useFullRange: boolean): boolean {
        return slopesEqual(e1.Delta.y, e2.Delta.x, e1.Delta.x, e2.Delta.y, useFullRange);
    }

    public static swapPositionsInAEL(edge1: TEdge, edge2: TEdge): boolean {
        //check that one or other edge hasn't already been removed from AEL ...
        if (edge1.NextInAEL === edge1.PrevInAEL || edge2.NextInAEL === edge2.PrevInAEL) {
            return false;
        }

        let prev: NullPtr<TEdge> = null;
        let next: NullPtr<TEdge> = null;

        if (edge1.NextInAEL === edge2) {
            next = edge2.NextInAEL;

            if (next !== null) {
                next.PrevInAEL = edge1;
            }

            prev = edge1.PrevInAEL;

            if (prev !== null) {
                prev.NextInAEL = edge2;
            }

            edge2.PrevInAEL = prev;
            edge2.NextInAEL = edge1;
            edge1.PrevInAEL = edge2;
            edge1.NextInAEL = next;

            return true;
        }

        if (edge2.NextInAEL === edge1) {
            next = edge1.NextInAEL;

            if (next !== null) {
                next.PrevInAEL = edge2;
            }

            prev = edge2.PrevInAEL;

            if (prev !== null) {
                prev.NextInAEL = edge1;
            }

            edge1.PrevInAEL = prev;
            edge1.NextInAEL = edge2;
            edge2.PrevInAEL = edge1;
            edge2.NextInAEL = next;

            return true;
        }

        next = edge1.NextInAEL;
        prev = edge1.PrevInAEL;
        edge1.NextInAEL = edge2.NextInAEL;

        if (edge1.NextInAEL !== null) {
            edge1.NextInAEL.PrevInAEL = edge1;
        }

        edge1.PrevInAEL = edge2.PrevInAEL;

        if (edge1.PrevInAEL !== null) {
            edge1.PrevInAEL.NextInAEL = edge1;
        }

        edge2.NextInAEL = next;

        if (edge2.NextInAEL !== null) {
            edge2.NextInAEL.PrevInAEL = edge2;
        }

        edge2.PrevInAEL = prev;

        if (edge2.PrevInAEL !== null) {
            edge2.PrevInAEL.NextInAEL = edge2;
        }

        return true;
    }

    public static swapPositionsInSEL(edge1: TEdge, edge2: TEdge): boolean {
        if ((edge1.NextInSEL === null && edge1.PrevInSEL === null) || (edge2.NextInSEL === null && edge2.PrevInSEL === null)) {
            return false;
        }

        let prev: NullPtr<TEdge> = null;
        let next: NullPtr<TEdge> = null;

        if (edge1.NextInSEL === edge2) {
            next = edge2.NextInSEL;

            if (next !== null) {
                next.PrevInSEL = edge1;
            }

            prev = edge1.PrevInSEL;

            if (prev !== null) {
                prev.NextInSEL = edge2;
            }

            edge2.PrevInSEL = prev;
            edge2.NextInSEL = edge1;
            edge1.PrevInSEL = edge2;
            edge1.NextInSEL = next;

            return true;
        }

        if (edge2.NextInSEL === edge1) {
            next = edge1.NextInSEL;

            if (next !== null) {
                next.PrevInSEL = edge2;
            }

            prev = edge2.PrevInSEL;

            if (prev !== null) {
                prev.NextInSEL = edge1;
            }

            edge1.PrevInSEL = prev;
            edge1.NextInSEL = edge2;
            edge2.PrevInSEL = edge1;
            edge2.NextInSEL = next;

            return true;
        }

        next = edge1.NextInSEL;
        prev = edge1.PrevInSEL;

        edge1.NextInSEL = edge2.NextInSEL;

        if (edge1.NextInSEL !== null) {
            edge1.NextInSEL.PrevInSEL = edge1;
        }

        edge1.PrevInSEL = edge2.PrevInSEL;

        if (edge1.PrevInSEL !== null) {
            edge1.PrevInSEL.NextInSEL = edge1;
        }

        edge2.NextInSEL = next;

        if (edge2.NextInSEL !== null) {
            edge2.NextInSEL.PrevInSEL = edge2;
        }

        edge2.PrevInSEL = prev;

        if (edge2.PrevInSEL !== null) {
            edge2.PrevInSEL.NextInSEL = edge2;
        }

        return true;
    }

    public static swapSides(edge1: TEdge, edge2: TEdge): void {
        const side: DIRECTION = edge1.Side;
        edge1.Side = edge2.Side;
        edge2.Side = side;
    }

    public static swapPolyIndexes(edge1: TEdge, edge2: TEdge): void {
        const outIdx: number = edge1.index;
        edge1.index = edge2.index;
        edge2.index = outIdx;
    }

    private static UNASSIGNED = -1;
}
