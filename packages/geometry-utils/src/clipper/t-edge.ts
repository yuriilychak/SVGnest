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
    public current: number;
    public next: number;
    public prev: number;
    public nextActive: number;
    public prevActive: number;
    public nextSorted: number;
    public prevSorted: number;
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
        this.nextLocalMinima = UNASSIGNED;
        this.next = UNASSIGNED;
        this.prev = UNASSIGNED;
        this.nextActive = UNASSIGNED;
        this.prevActive = UNASSIGNED;
        this.nextSorted = UNASSIGNED;
        this.prevSorted = UNASSIGNED;
        this.current = TEdge.edges.length;

        TEdge.edges.push(this);
    }

    public static at(index: number): NullPtr<TEdge> {
        return index >= 0 && index < TEdge.edges.length ? TEdge.edges[index] : null;
    }

    public static cleanup() {
        TEdge.edges.length = 0;
    }

    public init(nextIndex: number, prevIndex: number, point: PointI32): void {
        this.next = nextIndex;
        this.prev = prevIndex;
        this.curr.update(point);
        this.unassign();
    }

    public removeDuplicates(polyType: POLY_TYPE, isUseFullRange: boolean): number {
        let startIndex: number = this.current;
        let stopIndex: number = this.current;
        let currIndex: number = this.current;
        //2. Remove duplicate vertices, and (when closed) collinear edges ...

        while (true) {
            const currEdge = TEdge.at(currIndex);
            const nextEdge = TEdge.at(currEdge.next);
            const prevEdge = TEdge.at(currEdge.prev);

            if (currEdge.curr.almostEqual(nextEdge.curr)) {
                if (currIndex === nextEdge.next) {
                    break;
                }

                if (currEdge.current === startIndex) {
                    startIndex = nextEdge.current;
                }

                currIndex = currEdge.remove();
                stopIndex = currIndex;

                continue;
            }

            if (currEdge.prev === currEdge.next) {
                break;
            }

            if (PointI32.slopesEqual(prevEdge.curr, currEdge.curr, nextEdge.curr, isUseFullRange)) {
                //Collinear edges are allowed for open paths but in closed paths
                //the default is to merge adjacent collinear edges into a single edge.
                //However, if the PreserveCollinear property is enabled, only overlapping
                //collinear edges (ie spikes) will be removed from closed paths.
                if (currEdge.current === startIndex) {
                    startIndex = currEdge.next;
                }

                currEdge.remove();
                currIndex = prevEdge.current;
                stopIndex = currIndex;

                continue;
            }

            currIndex = nextEdge.current;

            if (currIndex === stopIndex) {
                break;
            }
        }

        const edge = TEdge.at(currIndex);

        if (edge.prev === edge.next) {
            return UNASSIGNED;
        }

        //3. Do second stage of edge initialization ...
        const startEdge = TEdge.at(startIndex);
        let isFlat: boolean = true;

        currIndex = startIndex;

        do {
            const edge1 = TEdge.at(currIndex);
            edge1.initFromPolyType(polyType);
            currIndex = edge1.next;

            const edge2 = TEdge.at(currIndex);

            if (isFlat && edge2.curr.y !== startEdge.curr.y) {
                isFlat = false;
            }
        } while (currIndex !== startIndex);
        //4. Finally, add edge bounds to LocalMinima list ...
        //Totally flat paths must be handled differently when adding them
        //to LocalMinima list to avoid endless loops etc ...
        return isFlat ? UNASSIGNED : currIndex;
    }

    public initFromPolyType(polyType: POLY_TYPE): void {
        const next = TEdge.at(this.next);

        if (this.curr.y >= next.curr.y) {
            this.bot.update(this.curr);
            this.top.update(next.curr);
        } else {
            this.top.update(this.curr);
            this.bot.update(next.curr);
        }

        this.setDx();

        this.polyTyp = polyType;
    }

    public remove(): number {
        const result: number = this.next;
        const next = TEdge.at(this.next);
        const prev = TEdge.at(this.prev);
        //removes e from double_linked_list (but without removing from memory)
        prev.next = this.next;
        next.prev = this.prev;
        this.prev = UNASSIGNED; //flag as removed (see ClipperBase.Clear)
        this.next = UNASSIGNED;

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

    public canJoinLeft(isUseFullRange: boolean): boolean {
        if(!this.isFilled || this.prevActive === UNASSIGNED) {
            return false;
        }

        const prevEdge = TEdge.at(this.prevActive);

        return prevEdge.curr.x === this.bot.x && prevEdge.isFilled &&
        TEdge.slopesEqual(this.prevActive, this.current, isUseFullRange);
    }

    public canJoinRight(isUseFullRange: boolean): boolean {
        if(!this.isFilled || this.prevActive === UNASSIGNED) {
            return false;
        }

        const prevEdge = TEdge.at(this.prevActive);

        return  prevEdge.isFilled && TEdge.slopesEqual(this.prevActive, this.current, isUseFullRange);
    }

    public canAddScanbeam() {
        if(!this.isFilled || this.prevActive === UNASSIGNED) {
            return false;
        }

        const prevEdge = TEdge.at(this.prevActive);

        return prevEdge.isFilled && prevEdge.curr.x === this.curr.x
    }

    public checkHorizontalCondition(isNext: boolean, isUseFullRange: boolean): boolean {
        const neighboarIndex =  isNext ? this.nextActive : this.prevActive;

        if(neighboarIndex === UNASSIGNED || !TEdge.slopesEqual(this.current, neighboarIndex, isUseFullRange)) {
            return false;
        }

        const neighboar = TEdge.at(neighboarIndex);

        return neighboar.curr.almostEqual(this.bot) && neighboar.isFilled && neighboar.curr.y > neighboar.top.y;
    }

    public checkSharedCondition(outHash: number, isNext: boolean, isUseFullRange: boolean): boolean {
        return outHash !== UNASSIGNED && this.checkHorizontalCondition(isNext, isUseFullRange) && !this.isWindDeletaEmpty;
    }

    public checkMinJoin(edgePrevIndex: number, point: PointI32, isUseFullRange: boolean): boolean {
        const edgePrev: NullPtr<TEdge> = TEdge.at(edgePrevIndex);

        return edgePrevIndex !== UNASSIGNED &&
            edgePrev.isFilled &&
            edgePrev.topX(point.y) === this.topX(point.y) &&
            TEdge.slopesEqual(this.current, edgePrevIndex, isUseFullRange) &&
            !this.isWindDeletaEmpty;
    }

    public static findNextLocMin(index: number): number {
        let result: number = index;

        while (true) {
            let currEdge = TEdge.at(result);
            let prevEdge = TEdge.at(currEdge.prev);

            while (!currEdge.bot.almostEqual(prevEdge.bot) || currEdge.curr.almostEqual(currEdge.top)) {
                result = currEdge.next;
                currEdge = TEdge.at(result);
                prevEdge = TEdge.at(currEdge.prev);
            }

            if (!currEdge.isDxHorizontal && !prevEdge.isDxHorizontal) {
                break;
            }

            while (prevEdge.isDxHorizontal) {
                result = currEdge.prev;
                currEdge = TEdge.at(result);
                prevEdge = TEdge.at(currEdge.prev);
            }

            const edgeIndex = result

            while (currEdge.isDxHorizontal) {
                result = currEdge.next;
                currEdge = TEdge.at(result);
                prevEdge = TEdge.at(currEdge.prev);
            }

            if (currEdge.top.y === prevEdge.bot.y) {
                continue;
            }

            const tempEdge = TEdge.at(edgeIndex);
            prevEdge = TEdge.at(tempEdge.prev);
            //ie just an intermediate horz.
            if (prevEdge.bot.x < currEdge.bot.x) {
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
        this.prevSorted = this.prevActive;
        this.nextSorted = this.nextActive;

        return this.nextActive;
    }

    public topX(y: number): number {
        //if (edge.Bot === edge.Curr) alert ("edge.Bot = edge.Curr");
        //if (edge.Bot === edge.Top) alert ("edge.Bot = edge.Top");
        return y === this.top.y ? this.top.x : this.bot.x + clipperRound(this.dx * (y - this.bot.y));
    }

    public alignWndCount(edgeIndex: number): void {
        const edge = TEdge.at(edgeIndex);

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

    public checkMaxPair(isNext: boolean): boolean {
        const index = isNext ? this.next : this.prev;
        const edge = TEdge.at(index);

        return index !== UNASSIGNED && edge.top.almostEqual(this.top) && edge.nextLocalMinima === UNASSIGNED
    }

    public get maximaPair(): number {
        let result: number = UNASSIGNED;

        if (this.checkMaxPair(true)) {
            result = this.next;
        } else if (this.checkMaxPair(false)) {
            result = this.prev;
        }

        const edge = TEdge.at(result);

        return result !== UNASSIGNED && edge.nextActive === edge.prevActive && !edge.isHorizontal ? UNASSIGNED : result;
    }

    public updateCurrent(index: number): void {
        const edge = TEdge.at(index);

        this.side = edge.side;
        this.windDelta = edge.windDelta;
        this.windCount1 = edge.windCount1;
        this.windCount2 = edge.windCount2;
        this.prevActive =  edge.prevActive;
        this.nextActive = edge.nextActive;
        this.curr.update(this.bot);
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

    public insertsBefore(edgeIndex: number): boolean {
        const edge = TEdge.at(edgeIndex);

        if (this.curr.x === edge.curr.x) {
            return this.top.y > edge.top.y ? this.top.x < edge.topX(this.top.y) : edge.top.x > this.topX(edge.top.y);
        }

        return this.curr.x < edge.curr.x;
    }

    public addEdgeToSEL(sortedEdgeIndex: number): number {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        this.prevSorted = UNASSIGNED;
        this.nextSorted = sortedEdgeIndex;

        if (sortedEdgeIndex !== UNASSIGNED) {
            TEdge.setNeighboar(sortedEdgeIndex, false, false, this.current);
        }

        return this.current;
    }

    public insertEdgeIntoAEL(activeEdgeIndex: number, startEdgeIndex: number = UNASSIGNED): number {
        if (activeEdgeIndex === UNASSIGNED) {
            this.prevActive = UNASSIGNED;
            this.nextActive = UNASSIGNED;

            return this.current;
        }

        if (startEdgeIndex === UNASSIGNED && this.insertsBefore(activeEdgeIndex)) {
            this.prevActive = UNASSIGNED;
            this.nextActive = activeEdgeIndex;

            TEdge.setNeighboar(activeEdgeIndex, false, true, this.current);

            return this.current;
        }

        let edgeIndex: number = startEdgeIndex === UNASSIGNED ? activeEdgeIndex : startEdgeIndex;
        let nextIndex: number = TEdge.getNeighboar(edgeIndex, true, true);

        while (nextIndex !== UNASSIGNED && !this.insertsBefore(nextIndex)) {
            edgeIndex = nextIndex;
            nextIndex = TEdge.getNeighboar(edgeIndex, true, true);
        }

        this.nextActive = nextIndex;

        if (nextIndex !== UNASSIGNED) {
            TEdge.setNeighboar(nextIndex, false, true, this.current);
        }

        this.prevActive = edgeIndex;
        TEdge.setNeighboar(edgeIndex, true, true, this.current);

        return activeEdgeIndex;
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

    public getBaseNeighboar(isNext: boolean): number {
        return isNext ? this.next : this.prev;
    }

    public checkReverseHorizontal(index: number, isNext: boolean): boolean {
        const neighboarIndex = this.getBaseNeighboar(isNext);
        const neighboar = TEdge.at(neighboarIndex);

        return this.isDxHorizontal && this.current !== index && this.bot.x !== neighboar.top.x;
    }

    public static processBound(index: number, isClockwise: boolean): number {
        let edge = TEdge.at(index);
        let result = edge;

        if (edge.isDxHorizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const neighboarIndex = edge.getBaseNeighboar(!isClockwise);
            const neighboar = TEdge.at(neighboarIndex);

            if (edge.bot.x !== neighboar.bot.x) {
                edge.reverseHorizontal();
            }
        }

        let neighboarIndex = edge.getBaseNeighboar(isClockwise);
        let neighboar = TEdge.at(neighboarIndex);
        
        while (result.top.y === neighboar.bot.y) {
            result = neighboar;
            neighboarIndex = neighboar.getBaseNeighboar(isClockwise);
            neighboar = TEdge.at(neighboarIndex);
        }

        if (result.isDxHorizontal) {
            //nb: at the top of a bound, horizontals are added to the bound
            //only when the preceding edge attaches to the horizontal's left vertex
            //unless a Skip edge is encountered when that becomes the top divide
            let horzNeighboarIndex = result.getBaseNeighboar(!isClockwise);
            let horzNeighboar = TEdge.at(horzNeighboarIndex);

            while (horzNeighboar.isDxHorizontal) {
                horzNeighboarIndex = horzNeighboar.getBaseNeighboar(!isClockwise);
                horzNeighboar = TEdge.at(horzNeighboarIndex);
            }

            const currNeighboarIndex = result.getBaseNeighboar(isClockwise);
            const currNeighboar = TEdge.at(currNeighboarIndex);

            if ((horzNeighboar.top.x === currNeighboar.top.x && !isClockwise) || horzNeighboar.top.x > currNeighboar.top.x) {
                result = horzNeighboar;
            }
        }

        while (edge !== result) {
            edge.nextLocalMinima = edge.getBaseNeighboar(isClockwise);

            if (edge.checkReverseHorizontal(index, !isClockwise)) {
                edge.reverseHorizontal();
            }

            edge = TEdge.at(edge.nextLocalMinima);
        }

        if (edge.checkReverseHorizontal(index, !isClockwise)) {
            edge.reverseHorizontal();
        }

        return result.getBaseNeighboar(isClockwise);
        //move to the edge just beyond current bound
    }

    public setWindingCount(activeEdgeIndex: number, clipType: CLIP_TYPE): void {
        let edgeIndex: number = this.prevActive;
        let edge = TEdge.at(edgeIndex);
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (edgeIndex !== UNASSIGNED && (edge.polyTyp !== this.polyTyp || edge.isWindDeletaEmpty)) {
            edgeIndex = TEdge.getNeighboar(edgeIndex, false, true);
            edge = TEdge.at(edgeIndex);
        }

        if (edgeIndex === UNASSIGNED) {
            this.windCount1 = this.isWindDeletaEmpty ? 1 : this.windDelta;
            this.windCount2 = 0;
            edgeIndex = activeEdgeIndex;
            //ie get ready to calc WindCnt2
        } else if (this.isWindDeletaEmpty && clipType !== CLIP_TYPE.UNION) {
            this.windCount1 = 1;
            this.windCount2 = edge.windCount2;
            edgeIndex = TEdge.getNeighboar(edgeIndex, true, true);
            //ie get ready to calc WindCnt2
        } else {
            edge = TEdge.at(edgeIndex);
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
            edgeIndex = edge.nextActive;
            //ie get ready to calc WindCnt2
        }
        //nonZero, Positive or Negative filling ...
        while (edgeIndex !== this.current) {
            edge = TEdge.at(edgeIndex);
            this.windCount2 += edge.windDelta;
            edgeIndex = TEdge.getNeighboar(edgeIndex, true, true);
        }
    }

    public static intersectPoint(edge1Index: number, edge2Index: number, intersectPoint: PointI32, useFullRange: boolean): boolean {
        //nb: with very large coordinate values, it's possible for SlopesEqual() to
        //return false but for the edge.Dx value be equal due to double precision rounding.
        const edge1 = TEdge.at(edge1Index);
        const edge2 = TEdge.at(edge2Index);
        if (TEdge.slopesEqual(edge1Index, edge2Index, useFullRange) || edge1.dx === edge2.dx) {
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

    public static slopesEqual(e1Index: number, e2Index: number, useFullRange: boolean): boolean {
        const e1 = TEdge.at(e1Index);
        const e2 = TEdge.at(e2Index);
        return slopesEqual(e1.delta.y, e2.delta.x, e1.delta.x, e2.delta.y, useFullRange);
    }

    public static getSwapPositionInEL(edge1Index: number, edge2Index: number, isAel: boolean): boolean {
        //check that one or other edge hasn't already been removed from EL ...
        const nextIndex1 = TEdge.getNeighboar(edge1Index, true, isAel);
        const nextIndex2 = TEdge.getNeighboar(edge2Index, true, isAel);
        const prevIndex1 = TEdge.getNeighboar(edge1Index, false, isAel);
        const prevIndex2 = TEdge.getNeighboar(edge2Index, false, isAel);
        const isRemoved: boolean = isAel 
            ? nextIndex1 === prevIndex1 || nextIndex2 === prevIndex2
            : (nextIndex1 === UNASSIGNED && prevIndex1 === UNASSIGNED) || (nextIndex2 === UNASSIGNED && prevIndex2 === UNASSIGNED);

        if (isRemoved) {
            return false;
        }

        if (nextIndex1 === edge2Index) {
            if (nextIndex2 !== UNASSIGNED) {
                TEdge.setNeighboar(nextIndex2, false, isAel, edge1Index);
            }

            if (prevIndex1 !== UNASSIGNED) {
                TEdge.setNeighboar(prevIndex1, true, isAel, edge2Index);
            }

            TEdge.setNeighboar(edge2Index, false, isAel, prevIndex1);
            TEdge.setNeighboar(edge2Index, true, isAel, edge1Index);
            TEdge.setNeighboar(edge1Index, false, isAel, edge2Index);
            TEdge.setNeighboar(edge1Index, true, isAel, nextIndex2);

            return true;
        }

        if (nextIndex2 === edge1Index) {
            if (nextIndex1 !== UNASSIGNED) {
                TEdge.setNeighboar(nextIndex1, false, isAel, edge2Index);
            }

            if (prevIndex2 !== UNASSIGNED) {
                TEdge.setNeighboar(prevIndex2, true, isAel, edge1Index);
            }

            TEdge.setNeighboar(edge1Index, false, isAel, prevIndex2);
            TEdge.setNeighboar(edge1Index, true, isAel, edge2Index);
            TEdge.setNeighboar(edge2Index, false, isAel, edge1Index);
            TEdge.setNeighboar(edge2Index, true, isAel, nextIndex1);

            return true;
        }

        TEdge.setNeighboar(edge1Index, true, isAel, nextIndex2);

        if (nextIndex2 !== UNASSIGNED) {
            TEdge.setNeighboar(nextIndex2, false, isAel, edge1Index);
        }

        TEdge.setNeighboar(edge1Index, false, isAel, prevIndex2);

        if (prevIndex2 !== UNASSIGNED) {
            TEdge.setNeighboar(prevIndex2, false, isAel, edge1Index);
        }

        TEdge.setNeighboar(edge2Index, true, isAel, nextIndex1);

        if (edge1Index !== UNASSIGNED) {
            TEdge.setNeighboar(nextIndex1, false, isAel, edge2Index);
        }

        TEdge.setNeighboar(edge2Index, false, isAel, prevIndex1);

        if (prevIndex1 !== UNASSIGNED) {
            TEdge.setNeighboar(prevIndex1, true, isAel, edge2Index);
        }

        return true;
    }

    public static swapPositionsInEL(edgeIndex1: number, edgeIndex2: number, isAel: boolean): number {
        if (TEdge.getSwapPositionInEL(edgeIndex1, edgeIndex2, isAel)) {
            if (TEdge.getNeighboar(edgeIndex1, false, isAel) === UNASSIGNED) {
                return edgeIndex1;
            }

            if (TEdge.getNeighboar(edgeIndex2, false, isAel) === UNASSIGNED) {
                return edgeIndex2;
            }
        }

        return UNASSIGNED;
    }

    public static getNeighboar(index: number, isNext: boolean, isAel: boolean): number {
        if (index === UNASSIGNED) {
            return UNASSIGNED;
        }

        const edge = TEdge.at(index);

        if (isNext) {
            return isAel ? edge.nextActive : edge.nextSorted;
        } 

        return isAel ? edge.prevActive : edge.prevSorted;
    }

    public static setNeighboar(index: number, isNext: boolean, isAel: boolean, value: number): void {
        if (index === UNASSIGNED) {
            return;
        }  

        const edge = TEdge.at(index);   

        if (isNext) {
            if (isAel) {
                edge.nextActive = value;

                return
            }

            edge.nextSorted = value;

            return;
        }

        if (isAel) {
            edge.prevActive = value;

            return;
        } 

        edge.prevSorted = value;
    }

    public static swapSides(edge1Index: number, edge2Index: number): void {
        const edge1 = TEdge.at(edge1Index);
        const edge2 = TEdge.at(edge2Index);
        const side: DIRECTION = edge1.side;
        edge1.side = edge2.side;
        edge2.side = side;
    }

    public static swapSidesAndIndeces(edge1Index: number, edge2Index: number): void {
        const edge1 = TEdge.at(edge1Index);
        const edge2 = TEdge.at(edge2Index);
        const side: DIRECTION = edge1.side;
        const outIdx: number = edge1.index;
        edge1.side = edge2.side;
        edge2.side = side;
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

            currentIndex = edge.nextActive;
        }
    }

    public static getHoleState(firstLeftIndex: number, edgeIndex: number): { isHole: boolean, index: number } {
        let isHole: boolean = false;
        let edge: NullPtr<TEdge> = TEdge.at(edgeIndex);
        let currentIndex: number = edge.prevActive;
        let index: number = UNASSIGNED;

        while (currentIndex !== UNASSIGNED) {
            edge = TEdge.at(currentIndex);
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
                isHole = !isHole;

                if (firstLeftIndex === UNASSIGNED) {
                    index = edge.index;
                }
            }

            currentIndex = edge.prevActive;
        }

        return { isHole, index };
    }

    public static getClockwise(index: number): boolean {
        const currEdge = TEdge.at(index);
        const prevEdge = TEdge.at(currEdge.prev);

        return currEdge.dx >= prevEdge.dx;
    }

    public static swapEdges(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE, e1Wc: number, e2Wc: number, edge1Index: number, edge2Index: number): boolean {
        const edge1 = TEdge.at(edge1Index);
        const edge2 = TEdge.at(edge2Index);
        let e1Wc2: number = 0;
        let e2Wc2: number = 0;

        switch (fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                e1Wc2 = edge1.windCount2;
                e2Wc2 = edge2.windCount2;
                break;
            case POLY_FILL_TYPE.NEGATIVE:
                e1Wc2 = -edge1.windCount2;
                e2Wc2 = -edge2.windCount2;
                break;
            default:
                e1Wc2 = Math.abs(edge1.windCount2);
                e2Wc2 = Math.abs(edge2.windCount2);
                break;
        }
        
        if (edge1.polyTyp !== edge2.polyTyp) {
            return true;
        }
        
        if (e1Wc === 1 && e2Wc === 1) {
            switch (clipType) {
                case CLIP_TYPE.UNION:
                    return e1Wc2 <= 0 && e2Wc2 <= 0;
                case CLIP_TYPE.DIFFERENCE:
                    return (
                        (edge1.polyTyp === POLY_TYPE.CLIP && Math.min(e1Wc2, e2Wc2) > 0) ||
                        (edge1.polyTyp === POLY_TYPE.SUBJECT && Math.max(e1Wc2, e2Wc2) <= 0)
                    );
                default:
                    return false;
            }
        }

        TEdge.swapSides(edge1Index, edge2Index);

        return false;
    }
}
