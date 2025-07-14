import { PointI32 } from '../geometry';
import { HORIZONTAL, UNASSIGNED } from './constants';
import { slopesEqual } from '../helpers';
import { clipperRound } from '../helpers';
import { POLY_TYPE, POLY_FILL_TYPE, CLIP_TYPE, DIRECTION, NullPtr } from './types';

export default class TEdge {
    private static edges: TEdge[] = [];
    public bot: PointI32;
    public curr: PointI32;
    public top: PointI32;
    public delta: PointI32;
    public dx: number;
    public polyTyp: POLY_TYPE;
    public side: DIRECTION;
    public windDelta: number;
    public windCount1: number;
    public windCount2: number;
    public index: number;
    public currentIndex: number;
    public nextIndex: number;
    public prevIndex: number;
    public nextActiveIndex: number;
    public prevActiveIndex: number;
    public nextSortedIndex: number;
    public prevSortedIndex: number;
    public nextLocalMinima: number;

    constructor() {
        this.bot = PointI32.create();
        this.curr = PointI32.create();
        this.top = PointI32.create();
        this.delta = PointI32.create();
        this.dx = 0;
        this.polyTyp = POLY_TYPE.SUBJECT;
        this.side = DIRECTION.LEFT;
        this.windDelta = 0;
        this.windCount1 = 0;
        this.windCount2 = 0;
        this.index = 0;
        this.prev = null;
        this.nextLocalMinima = UNASSIGNED;
        this.nextIndex = UNASSIGNED;
        this.prevIndex = UNASSIGNED;
        this.nextActiveIndex = UNASSIGNED;
        this.prevActiveIndex = UNASSIGNED;
        this.nextSortedIndex = UNASSIGNED;
        this.prevSortedIndex = UNASSIGNED;
        this.currentIndex = TEdge.edges.length;

        TEdge.edges.push(this);
    }

    public static at(index: number): NullPtr<TEdge> {
        return index >= 0 && index < TEdge.edges.length ? TEdge.edges[index] : null;
    }

    public static cleanup() {
        TEdge.edges.length = 0;
    }

    public get next() {
        return TEdge.at(this.nextIndex);
    }

    public set next(value: TEdge) {
        this.nextIndex = value ? value.currentIndex : UNASSIGNED;
    }
    
    public get prev() {
        return TEdge.at(this.prevIndex);
    }

    public set prev(value: TEdge) {
        this.prevIndex = value ? value.currentIndex : UNASSIGNED;
    }

    public get nextActive() {
        return TEdge.at(this.nextActiveIndex);
    }

    public set nextActive(value: TEdge) {
        this.nextActiveIndex = value ? value.currentIndex : UNASSIGNED;
    }
    
    public get prevActive() {
        return TEdge.at(this.prevActiveIndex);
    }

    public set prevActive(value: TEdge) {
        this.prevActiveIndex = value ? value.currentIndex : UNASSIGNED;
    }

    public get nextSorted() {
        return TEdge.at(this.nextSortedIndex);
    }

    public set nextSorted(value: TEdge) {
        this.nextSortedIndex = value ? value.currentIndex : UNASSIGNED;
    }
    
    public get prevSorted() {
        return TEdge.at(this.prevSortedIndex);
    }

    public set prevSorted(value: TEdge) {
        this.prevSortedIndex = value ? value.currentIndex : UNASSIGNED;
    }

    public init(nextIndex: number, prevIndex: number, point: PointI32): void {
        this.nextIndex = nextIndex;
        this.prevIndex = prevIndex;
        this.curr.update(point);
        this.unassign();
    }

    public initFromPolyType(polyType: POLY_TYPE): void {
        if (this.curr.y >= this.next.curr.y) {
            this.bot.update(this.curr);
            this.top.update(this.next.curr);
        } else {
            this.top.update(this.curr);
            this.bot.update(this.next.curr);
        }

        this.setDx();

        this.polyTyp = polyType;
    }

    public remove(): number {
        const result: number = this.nextIndex;
        const next = TEdge.at(this.nextIndex);
        const prev = TEdge.at(this.prevIndex);
        //removes e from double_linked_list (but without removing from memory)
        prev.nextIndex = this.nextIndex;
        next.prevIndex = this.prevIndex;
        this.prevIndex = UNASSIGNED; //flag as removed (see ClipperBase.Clear)
        this.nextIndex = UNASSIGNED;

        return result;
    }

    public reverseHorizontal(): void {
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        const tmp: number = this.top.x;
        this.top.x = this.bot.x;
        this.bot.x = tmp;
    }

    public findNextLocMin(): number {
        let result: number = this.currentIndex;
        let edge: TEdge = this;

        while (true) {
            edge = TEdge.at(result);
            while (!edge.bot.almostEqual(edge.prev.bot) || edge.curr.almostEqual(edge.top)) {
                result = edge.nextIndex;
                edge = TEdge.at(result);
            }

            if (!edge.isDxHorizontal && !edge.prev.isDxHorizontal) {
                break;
            }

            while (edge.prev.isDxHorizontal) {
                result = edge.prevIndex;
                edge = TEdge.at(result);
            }

            const edgeIndex = result

            while (edge.isDxHorizontal) {
                result = edge.nextIndex;
                edge = TEdge.at(result);
            }

            if (edge.top.y === edge.prev.bot.y) {
                continue;
            }

            const tempEdge = TEdge.at(edgeIndex);
            //ie just an intermediate horz.
            if (tempEdge.prev.bot.x < edge.bot.x) {
                result = edgeIndex;
            }

            break;
        }

        return result;
    }

    public setDx(): void {
        this.delta.update(this.top).sub(this.bot);
        this.dx = this.delta.y === 0 ? HORIZONTAL : this.delta.x / this.delta.y;
    }

    public reset(side: DIRECTION): void {
        this.curr.update(this.bot);
        this.side = side;
        this.unassign();
    }

    public copyAELToSEL(): number {
        this.prevSortedIndex = this.prevActiveIndex;
        this.nextSortedIndex = this.nextActiveIndex;

        return this.nextActiveIndex;
    }

    public topX(y: number): number {
        //if (edge.Bot === edge.Curr) alert ("edge.Bot = edge.Curr");
        //if (edge.Bot === edge.Top) alert ("edge.Bot = edge.Top");
        return y === this.top.y ? this.top.x : this.bot.x + clipperRound(this.dx * (y - this.bot.y));
    }

    public getNext(isAel: boolean): NullPtr<TEdge> {
        return isAel ? this.nextActive : this.nextSorted;
    }

    public setNext(isAel: boolean, value: NullPtr<TEdge>): void{
        if (isAel) {
            this.nextActive = value;
         }  else {
            this.nextSorted = value;
         }
    }

    public getPrev(isAel: boolean): NullPtr<TEdge> {
        return isAel ? this.prevActive : this.prevSorted;
    }

    public setPrev(isAel: boolean, value: NullPtr<TEdge>): void{
        if (isAel) {
            this.prevActive = value;
         }  else {
            this.prevSorted = value;
         }
    }

    public deleteFromEL(inputEdge: TEdge, isAel: boolean): NullPtr<TEdge> {
        const next = this.getNext(isAel);
        const prev = this.getPrev(isAel);
        const hasNext = next !== null;
        const hasPrev = prev !== null;

        if (!hasPrev && !hasNext && this !== inputEdge) {
            return inputEdge;
        }

        let result: TEdge = inputEdge;
        //already deleted
        if (hasPrev) {
            prev.setNext(isAel, next);
        } else {
            result = next;
        }

        if (hasNext) {
            next.setPrev(isAel, prev);
        }

        this.setNext(isAel, null);
        this.setPrev(isAel, null);

        return result;
    }

    public alignWndCount(edge: TEdge): void {
        if (this.polyTyp === edge.polyTyp) {
            this.windCount1 = this.windCount1 === -edge.windDelta ? -this.windCount1 : this.windCount1 + edge.windDelta;
            edge.windCount1 = edge.windCount1 === this.windDelta ? -edge.windCount1 : edge.windCount1 - this.windDelta;
        } else {
            this.windCount2 += edge.windDelta;
            edge.windCount2 -= this.windDelta;
        }

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

    public getStop(point: PointI32, isProtect: boolean): boolean {
        return !isProtect && this.nextLocalMinima === UNASSIGNED && this.top.almostEqual(point);
    }

    public getIntermediate(y: number): boolean {
        return this.top.y === y && this.nextLocalMinima !== UNASSIGNED;
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

    public get maximaPair(): NullPtr<TEdge> {
        let result: NullPtr<TEdge> = null;

        if (this.next !== null && this.next.top.almostEqual(this.top) && this.next.nextLocalMinima === UNASSIGNED) {
            result = this.next;
        } else if (this.prev !== null && this.prev.top.almostEqual(this.top) && this.prev.nextLocalMinima === UNASSIGNED) {
            result = this.prev;
        }

        return result !== null && result.nextActive === result.prevActive && !result.isHorizontal ? null : result;
    }

    public getMaxima(y: number): boolean {
        return this.top.y === y && this.nextLocalMinima === UNASSIGNED;
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

    public insertsBefore(edge: TEdge): boolean {
        if (this.curr.x === edge.curr.x) {
            return this.top.y > edge.top.y ? this.top.x < edge.topX(this.top.y) : edge.top.x > this.topX(edge.top.y);
        }

        return this.curr.x < edge.curr.x;
    }

    public addEdgeToSEL(sortedEdge: NullPtr<TEdge>): TEdge {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        this.prevSorted = null;
        this.nextSorted = sortedEdge;

        if (sortedEdge !== null) {
            sortedEdge.prevSorted = this;
        }

        return this;
    }

    public insertEdgeIntoAEL(activeEdge: NullPtr<TEdge>, startEdge: NullPtr<TEdge> = null): TEdge {
        if (activeEdge === null) {
            this.prevActive = null;
            this.nextActive = null;

            return this;
        }

        if (startEdge === null && this.insertsBefore(activeEdge)) {
            this.prevActive = null;
            this.nextActive = activeEdge;
            activeEdge.prevActive = this;

            return this;
        }

        let edge: TEdge = startEdge === null ? activeEdge : startEdge;

        while (edge.nextActive !== null && !this.insertsBefore(edge.nextActive)) {
            edge = edge.nextActive;
        }

        this.nextActive = edge.nextActive;

        if (edge.nextActive !== null) {
            edge.nextActive.prevActive = this;
        }

        this.prevActive = edge;
        edge.nextActive = this;

        return activeEdge;
    }

    public getNextInAEL(direction: DIRECTION): NullPtr<TEdge> {
        return direction === DIRECTION.RIGHT ? this.nextActive : this.prevActive;
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

    public processBound(isClockwise: boolean): TEdge {
        let edge: TEdge = this;
        let startEdge: TEdge = edge;
        let result: TEdge = edge;
        let horzEdge: TEdge = null;

        if (edge.isDxHorizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const startX: number = isClockwise ? edge.prev.bot.x : edge.next.bot.x;

            if (edge.bot.x !== startX) {
                edge.reverseHorizontal();
            }
        }

        if (isClockwise) {
            while (result.top.y === result.next.bot.y) {
                result = result.next;
            }

            if (result.isDxHorizontal) {
                //nb: at the top of a bound, horizontals are added to the bound
                //only when the preceding edge attaches to the horizontal's left vertex
                //unless a Skip edge is encountered when that becomes the top divide
                horzEdge = result;

                while (horzEdge.prev.isDxHorizontal) {
                    horzEdge = horzEdge.prev;
                }

                if (horzEdge.prev.top.x === result.next.top.x) {
                    if (!isClockwise) {
                        result = horzEdge.prev;
                    }
                } else if (horzEdge.prev.top.x > result.next.top.x) {
                    result = horzEdge.prev;
                }
            }

            while (edge !== result) {
                edge.nextLocalMinima = edge.next.currentIndex;

                if (edge.isDxHorizontal && edge !== startEdge && edge.bot.x !== edge.prev.top.x) {
                    edge.reverseHorizontal();
                }

                edge = edge.next;
            }

            if (edge.isDxHorizontal && edge !== startEdge && edge.bot.x !== edge.prev.top.x) {
                edge.reverseHorizontal();
            }

            result = result.next;
            //move to the edge just beyond current bound
        } else {
            while (result.top.y === result.prev.bot.y) {
                result = result.prev;
            }

            if (result.isDxHorizontal) {
                horzEdge = result;

                while (horzEdge.next.isDxHorizontal) {
                    horzEdge = horzEdge.next;
                }

                if (horzEdge.next.top.x === result.prev.top.x) {
                    if (!isClockwise) {
                        result = horzEdge.next;
                    }
                } else if (horzEdge.next.top.x > result.prev.top.x) {
                    result = horzEdge.next;
                }
            }

            while (edge !== result) {
                edge.nextLocalMinima = edge.prev.currentIndex;

                if (edge.isDxHorizontal && edge !== startEdge && edge.bot.x !== edge.next.top.x) {
                    edge.reverseHorizontal();
                }

                edge = edge.prev;
            }

            if (edge.isDxHorizontal && edge !== startEdge && edge.bot.x !== edge.next.top.x) {
                edge.reverseHorizontal();
            }

            result = result.prev;
            //move to the edge just beyond current bound
        }

        return result;
    }

    public setWindingCount(activeEdge: TEdge, clipType: CLIP_TYPE): void {
        let edge: NullPtr<TEdge> = this.prevActive;
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (edge !== null && (edge.polyTyp !== this.polyTyp || edge.isWindDeletaEmpty)) {
            edge = edge.prevActive;
        }

        if (edge === null) {
            this.windCount1 = this.isWindDeletaEmpty ? 1 : this.windDelta;
            this.windCount2 = 0;
            edge = activeEdge;
            //ie get ready to calc WindCnt2
        } else if (this.isWindDeletaEmpty && clipType !== CLIP_TYPE.UNION) {
            this.windCount1 = 1;
            this.windCount2 = edge.windCount2;
            edge = edge.nextActive;
            //ie get ready to calc WindCnt2
        } else {
            //nonZero, Positive or Negative filling ...
            if (edge.windCount1 * edge.windDelta < 0) {
                //prev edge is 'decreasing' WindCount (WC) toward zero
                //so we're outside the previous polygon ...
                if (Math.abs(edge.windCount1) > 1) {
                    //outside prev poly but still inside another.
                    //when reversing direction of prev poly use the same WC
                    this.windCount1 = edge.windDelta * this.windDelta < 0 ? edge.windCount1 : edge.windCount1 + this.windDelta;
                } else {
                    this.windCount1 = this.isWindDeletaEmpty ? 1 : this.windDelta;
                }
            } else {
                //prev edge is 'increasing' WindCount (WC) away from zero
                //so we're inside the previous polygon ...
                if (this.isWindDeletaEmpty) {
                    this.windCount1 = edge.windCount1 < 0 ? edge.windCount1 - 1 : edge.windCount1 + 1;
                } else {
                    this.windCount1 = edge.windDelta * this.windDelta < 0 ? edge.windCount1 : edge.windCount1 + this.windDelta;
                }
            }

            this.windCount2 = edge.windCount2;
            edge = edge.nextActive;
            //ie get ready to calc WindCnt2
        }
        //nonZero, Positive or Negative filling ...
        while (edge !== this) {
            this.windCount2 += edge.windDelta;
            edge = edge.nextActive;
        }
    }

    public static intersectPoint(edge1: TEdge, edge2: TEdge, intersectPoint: PointI32, useFullRange: boolean): boolean {
        //nb: with very large coordinate values, it's possible for SlopesEqual() to
        //return false but for the edge.Dx value be equal due to double precision rounding.
        if (TEdge.slopesEqual(edge1, edge2, useFullRange) || edge1.dx === edge2.dx) {
            const point: PointI32 = edge2.bot.y > edge1.bot.y ? edge2.bot : edge1.bot;

            intersectPoint.update(point);

            return false;
        }

        if (edge1.delta.x === 0) {
            intersectPoint.set(
                edge1.bot.x,
                edge2.isHorizontal ? edge2.bot.y : clipperRound((edge1.bot.x - edge2.bot.x) / edge2.dx + edge2.bot.y)
            );
        } else if (edge2.delta.x === 0) {
            intersectPoint.set(
                edge2.bot.x,
                edge1.isHorizontal ? edge1.bot.y : clipperRound((edge2.bot.x - edge1.bot.x) / edge1.dx + edge1.bot.y)
            );
        } else {
            const b1 = edge1.bot.x - edge1.bot.y * edge1.dx;
            const b2 = edge2.bot.x - edge2.bot.y * edge2.dx;
            const q: number = (b2 - b1) / (edge1.dx - edge2.dx);

            intersectPoint.set(
                Math.abs(edge1.dx) < Math.abs(edge2.dx) ? clipperRound(edge1.dx * q + b1) : clipperRound(edge2.dx * q + b2),
                clipperRound(q)
            );
        }

        if (intersectPoint.y < edge1.top.y || intersectPoint.y < edge2.top.y) {
            if (edge1.top.y > edge2.top.y) {
                intersectPoint.set(edge2.topX(edge1.top.y), edge1.top.y);

                return intersectPoint.x < edge1.top.x;
            }

            intersectPoint.set(
                Math.abs(edge1.dx) < Math.abs(edge2.dx) ? edge1.topX(intersectPoint.y) : edge2.topX(intersectPoint.y),
                edge2.top.y
            );
        }

        return true;
    }

    public static slopesEqual(e1: TEdge, e2: TEdge, useFullRange: boolean): boolean {
        return slopesEqual(e1.delta.y, e2.delta.x, e1.delta.x, e2.delta.y, useFullRange);
    }

    public static getSwapPositionInEL(edge1: TEdge, edge2: TEdge, isAel: boolean): boolean {
        //check that one or other edge hasn't already been removed from EL ...
        const isRemoved: boolean = isAel 
            ? edge1.getNext(isAel) === edge1.getPrev(isAel) || edge2.getNext(isAel) === edge2.getPrev(isAel)
            : (edge1.getNext(isAel) === null && edge1.getPrev(isAel) === null) || (edge2.getNext(isAel) === null && edge2.getPrev(isAel) === null);

        if (isRemoved) {
            return false;
        }

        let prev: NullPtr<TEdge> = null;
        let next: NullPtr<TEdge> = null;

        if (edge1.getNext(isAel) === edge2) {
            next = edge2.getNext(isAel);

            if (next !== null) {
                next.setPrev(isAel, edge1);
            }

            prev = edge1.getPrev(isAel);

            if (prev !== null) {
                prev.setNext(isAel, edge2);
            }

            edge2.setPrev(isAel, prev);
            edge2.setNext(isAel, edge1);
            edge1.setPrev(isAel, edge2);
            edge1.setNext(isAel, next);

            return true;
        }

        if (edge2.getNext(isAel) === edge1) {
            next = edge1.getNext(isAel);

            if (next !== null) {
                next.setPrev(isAel, edge2);
            }

            prev = edge2.getPrev(isAel);

            if (prev !== null) {
                prev.setNext(isAel, edge1);
            }

            edge1.setPrev(isAel, prev)
            edge1.setNext(isAel, edge2);
            edge2.setPrev(isAel, edge1);
            edge2.setNext(isAel, next);

            return true;
        }

        next = edge1.getNext(isAel);
        prev = edge1.getPrev(isAel);

        edge1.setNext(isAel, edge2.getNext(isAel));

        if (edge1.getNext(isAel) !== null) {
            edge1.getNext(isAel).setPrev(isAel, edge1);
        }

        edge1.setPrev(isAel, edge2.getPrev(isAel));

        if (edge1.getPrev(isAel) !== null) {
            edge1.getPrev(isAel).setNext(isAel, edge1);
        }

        edge2.setNext(isAel, next);

        if (edge2.getNext(isAel) !== null) {
            edge2.getNext(isAel).setPrev(isAel, edge2);
        }

        edge2.setPrev(isAel, prev);

        if (edge2.getPrev(isAel) !== null) {
            edge2.getPrev(isAel).setNext(isAel, edge2);
        }

        return true;
    }

    public static swapPositionsInEL(edge1: TEdge, edge2: TEdge, isAel: boolean): NullPtr<TEdge> {
        if (TEdge.getSwapPositionInEL(edge1, edge2, isAel)) {
            if (edge1.getPrev(isAel) === null) {
                return edge1;
            } else if (edge2.getPrev(isAel) === null) {
                return edge2;
            }
        }

        return null;
    }

    public static getNeighboarIndex(index: number, isNext: boolean, isAel: boolean): number {
        const edge: TEdge = TEdge.at(index);

        if (edge === null) {
            return UNASSIGNED;
        }

        if (isNext) {
            return isAel ? edge.nextActiveIndex : edge.nextSortedIndex;
        } 

        return isAel ? edge.prevActiveIndex : edge.prevSortedIndex;
    }

    public static setNeighboarIndex(index: number, isNext: boolean, isAel: boolean, value: number): void {
        const edge: TEdge = TEdge.at(index);    

        if (edge === null) {
            return;
        }  

        if (isNext) {
            if (isAel) {
                edge.nextActiveIndex = value;

                return
            }
            
            edge.nextSortedIndex = value;

            return;
        }

        if (isAel) {
            edge.prevActiveIndex = value;

            return;
        } 

        edge.prevSortedIndex = value;
    }

    public static swapSides(edge1: TEdge, edge2: TEdge): void {
        const side: DIRECTION = edge1.side;
        edge1.side = edge2.side;
        edge2.side = side;
    }

    public static swapPolyIndexes(edge1: TEdge, edge2: TEdge): void {
        const outIdx: number = edge1.index;
        edge1.index = edge2.index;
        edge2.index = outIdx;
    }


    public static updateIndexAEL(edgeIndex: number, side: DIRECTION, oldIndex: number, newIndex: number): void {
        let currentIndex: number = edgeIndex;

        while (currentIndex !== UNASSIGNED) {
            const edge = TEdge.at(currentIndex);

            if (edge.index === oldIndex) {
                edge.index = newIndex;
                edge.side = side;
                break;
            }

            currentIndex = edge.nextActiveIndex;
        }
    }

    public static getHoleState(firstLeftIndex: number, edgeIndex: number): { isHole: boolean, index: number } {
        let isHole: boolean = false;
        let edge: NullPtr<TEdge> = TEdge.at(edgeIndex);
        let currentIndex: number = edge.prevActiveIndex;
        let index: number = UNASSIGNED;

        while (currentIndex !== UNASSIGNED) {
            edge = TEdge.at(currentIndex);
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
                isHole = !isHole;

                if (firstLeftIndex === UNASSIGNED) {
                    index = edge.index;
                }
            }

            currentIndex = edge.prevActiveIndex;
        }

        return { isHole, index };
    }
}
