import { Point } from '../types';
import { PointI32 } from '../geometry';
import { HORIZONTAL } from './constants';
import { DIRECTION, NullPtr } from './types';
export default class OutPt {
    private static points: OutPt[] = [];

    public readonly point: Point<Int32Array>;

    public next: number;

    public prev: number;

    public current: number;

    constructor(point: Point<Int32Array>) {
        this.point = PointI32.from(point);
        this.next = -1;
        this.prev = -1;
        this.current = OutPt.points.length;

        OutPt.points.push(this);
    }

    public static at(index: number): NullPtr<OutPt> {
        return index >= 0 && index < OutPt.points.length ? OutPt.points[index] : null;
    }

    public static cleanup(): void {
        this.points.length = 0;
    }
    
    public containsPoly(inputOutPt: OutPt): boolean {
        let outPt: OutPt = inputOutPt;
        let res: number = 0;

        do {
            res = this.pointIn(outPt.point);

            if (res >= 0) {
                return res !== 0;
            }

            outPt = OutPt.at(outPt.next);
        } while (outPt !== inputOutPt);

        return true;
    }

    public canSplit(outPt: OutPt): boolean {
        return this.point.almostEqual(outPt.point) && outPt.next != this.current && outPt.prev != this.current;
    }

    public split(op2: OutPt): OutPt {
        const op3 = OutPt.at(this.prev);
        OutPt.at(op2.prev).push(this, true);
        op3.push(op2, true);
        

        return op2;
    }

    public export(): Point<Int32Array>[] {
        const pointCount = this.size;

        if (pointCount < 2) {
            return [];
        }

        const result: Point<Int32Array>[] = new Array(pointCount);
        let outPt: OutPt = OutPt.at(this.prev);
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point.clone();
            outPt = OutPt.at(outPt.prev);
        }

        return result;
    }

    public get size(): number {
        return this.prev !== -1 ? OutPt.at(this.prev).pointCount : 0;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): NullPtr<OutPt> {
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutIndex: number = -1;
        let outPt: NullPtr<OutPt> = this;

        while (true) {
            if (outPt.prev === outPt.current || outPt.prev === outPt.next) {
                outPt.dispose();

                return null;
            }

            const nextPt: NullPtr<OutPt> = OutPt.at(outPt.next);
            const prevPt: NullPtr<OutPt> = OutPt.at(outPt.prev);
            //test for duplicate points and collinear edges ...
            if (
                outPt.point.almostEqual(nextPt.point) ||
                outPt.point.almostEqual(prevPt.point) ||
                (PointI32.slopesEqual(prevPt.point, outPt.point, nextPt.point, useFullRange) &&
                    (!preserveCollinear || !outPt.point.getBetween(prevPt.point, nextPt.point)))
            ) {
                lastOutIndex = -1;
                outPt = outPt.remove();

                continue;
            }

            if (outPt.current === lastOutIndex) {
                break;
            }

            if (lastOutIndex === -1) {
                lastOutIndex = outPt.current;
            }

            outPt = OutPt.at(outPt.next);
        }

        return outPt;
    }

    public remove(): OutPt {
        const result = OutPt.at(this.prev);
        OutPt.at(this.prev).push(OutPt.at(this.next), true);
        this.prev = -1;
        this.next = -1;
        
        return result;
    }

    public dispose(): void {
        OutPt.at(this.prev).next = -1;

        let outPt: OutPt | null = this;

        while (outPt !== null) {
            outPt = OutPt.at(outPt.next);
        }
    }

    public duplicate(isInsertAfter: boolean): OutPt {
        const result: OutPt = new OutPt(this.point);

        if (isInsertAfter) {
            result.push(OutPt.at(this.next), true);
            this.push(result, true);
        } else {
            OutPt.at(this.prev).push(result, true);
            result.push(this, true);
        }

        return result;
    }

    public insertBefore(point: Point<Int32Array>): number {
        const outPt = new OutPt(point);
        OutPt.at(this.prev).push(outPt, true);
        outPt.push(this, true);

        return outPt.current;
    }

    public get pointCount(): number {
        let result: number = 0;
        let outPt: OutPt = this;

        do {
            ++result;
            outPt = OutPt.at(outPt.next);
        } while (outPt !== this);

        return result;
    }

    public get sameAsNext(): boolean {
        return this.current === this.next;
    }

    public reverse(): void {
        let outPt: OutPt = this;
        let pp1: OutPt = outPt;
        let pp2: NullPtr<OutPt> = null;

        do {
            pp2 = OutPt.at(pp1.next);
            pp1.next = pp1.prev;
            pp1.prev = pp2.current;
            pp1 = pp2;
        } while (pp1 !== outPt);
    }

    public getUniquePt(isNext: boolean): number {
        let result = OutPt.getNeighboarIndex(this.current, isNext);

        while (OutPt.almostEqual(result, this.current) && result !== this.current) {
            result = OutPt.getNeighboarIndex(result, isNext);
        }

        return result;
    }

    private searchPrevBottom(outIndex1: number, outIndex2: number): number {
        let currIndex  = this.current;
        let nghbIndex = OutPt.getNeighboarIndex(currIndex, false);
        let currPt: OutPt = OutPt.at(currIndex);
        let nghbPt: OutPt = OutPt.at(nghbIndex);

        while (nghbPt.point.y === currPt.point.y && nghbIndex !== outIndex1 && nghbIndex !== outIndex2) {
            currIndex = nghbIndex;
            nghbIndex = OutPt.getNeighboarIndex(currIndex, false);
            currPt = OutPt.at(currIndex);
            nghbPt = OutPt.at(nghbIndex);
        }

        return currIndex;
    }

    private searchNextBottom(outIndex1: number, outIndex2: number): number {
        let currIndex  = this.current;
        let nghbIndex = OutPt.getNeighboarIndex(currIndex, true);
        let currPt = OutPt.at(currIndex);
        let nghbPt = OutPt.at(nghbIndex);

        while (nghbPt.point.y === currPt.point.y && nghbIndex !== outIndex1 && nghbIndex !== outIndex2) {
            currIndex = nghbIndex;
            nghbIndex = OutPt.getNeighboarIndex(currIndex, true);
            currPt = OutPt.at(currIndex);
            nghbPt = OutPt.at(nghbIndex);
        }

        return currIndex;
    }

    public flatHorizontal(outPt1: OutPt, outPt2: OutPt): number[] {
        const outIndex = this.searchPrevBottom(this.current, outPt2.current);
        const outBIndex = this.searchNextBottom(outIndex, outPt1.current);
        const outBIndexNext = OutPt.getNeighboarIndex(outBIndex, true);

        return outBIndexNext === outIndex || outBIndexNext === outPt1.current ? [] : [outIndex, outBIndex];
    }

    public strictlySimpleJoin(point: Point<Int32Array>): boolean {
        let result = OutPt.at(this.next);

        while (result.current !== this.current && result.point.almostEqual(point)) {
            result = OutPt.at(result.next);
        }

        return result.point.y > point.y;
    }

    public applyJoin(op2: OutPt, reverse: boolean): OutPt {
        const op1b = this.duplicate(!reverse);
        const op2b = op2.duplicate(reverse);

        if (reverse) {
            op2.push(this, true);
            op1b.push(op2b, true);
        } else {
            this.push(op2, true);
            op2b.push(op1b, true);
        }

        return op1b;
    }

    private pointIn(pt: Point<Int32Array>): number {
        //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
        //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
        let outPt: OutPt = this;
        let startOutPt: OutPt = outPt;
        let result: number = 0;
        let poly0x: number = 0;
        let poly0y: number = 0;
        let poly1x: number = 0;
        let poly1y: number = 0;
        let d: number = 0;

        while (true) {
            const nextPt = OutPt.at(outPt.next);
            poly0x = outPt.point.x;
            poly0y = outPt.point.y;
            poly1x = nextPt.point.x;
            poly1y = nextPt.point.y;

            if (poly1y === pt.y) {
                if (poly1x === pt.x || (poly0y === pt.y && poly1x > pt.x === poly0x < pt.x)) {
                    return -1;
                }
            }

            if (poly0y < pt.y !== poly1y < pt.y) {
                if (poly0x >= pt.x) {
                    if (poly1x > pt.x) {
                        result = 1 - result;
                    } else {
                        d = (poly0x - pt.x) * (poly1y - pt.y) - (poly1x - pt.x) * (poly0y - pt.y);

                        if (d == 0) {
                            return -1;
                        }

                        if (d > 0 === poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                } else {
                    if (poly1x > pt.x) {
                        d = (poly0x - pt.x) * (poly1y - pt.y) - (poly1x - pt.x) * (poly0y - pt.y);

                        if (d === 0) {
                            return -1;
                        }

                        if (d > 0 === poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                }
            }

            outPt = OutPt.at(outPt.next);

            if (startOutPt.current === outPt.current) {
                break;
            }
        }

        return result;
    }

    public join(outPt: OutPt, side1: DIRECTION, side2: DIRECTION): OutPt {
        return  side1 === DIRECTION.LEFT 
            ? this.joinLeft(outPt, side2)
            : this.joinRight(outPt, side2);
    }
    
    private joinLeft(outPt: OutPt, direction: DIRECTION): OutPt {
        const p1_lft: OutPt = this;
        const p1_rt: OutPt = OutPt.at(p1_lft.prev);
        const p2_lft: OutPt = outPt;
        const p2_rt: OutPt = OutPt.at(p2_lft.prev);

        if (direction === DIRECTION.LEFT) {
            //z y x a b c
            p2_lft.reverse();
            p2_lft.push(p1_lft, true);
            p1_rt.push(p2_rt, true);

            return p2_rt;
        }
        //x y z a b c
        p2_rt.push(p1_lft, true);
        p1_rt.push(p2_lft, true);

        return p2_lft;
    }

    private joinRight(outPt: OutPt, direction: DIRECTION): OutPt {
        const p1_lft: OutPt = this;
        const p1_rt: OutPt = OutPt.at(p1_lft.prev);
        const p2_lft: OutPt = outPt;
        const p2_rt: OutPt = OutPt.at(p2_lft.prev);

        if (direction === DIRECTION.RIGHT) {
            //a b c z y x
            p2_lft.reverse();
            p1_rt.push(p2_rt, true);
            p2_lft.push(p1_lft, true);
        } else {
            //a b c x y z
            p1_rt.push(p2_lft, true);
            p2_rt.push(p1_lft, true); 
        }

        return this;
    }

    private getNeighboar(isNext: boolean): NullPtr<OutPt> {
        return OutPt.at(isNext ? this.next : this.prev);
    }

    private getDistance(isNext: boolean): number {
        let index = OutPt.getNeighboarIndex(this.current, isNext);
        
        if(index === -1) {
            return Number.NaN;
        }

        while (OutPt.almostEqual(this.current, index) && index !== this.current) {
            index = OutPt.getNeighboarIndex(index, isNext);

            if(index === -1) {
                return Number.NaN;
            }
        }

        const point: OutPt = OutPt.at(index);
        const offsetY: number = point.point.y - this.point.y;
        const offsetX: number = point.point.x - this.point.x;
        const result = offsetY === 0 ? HORIZONTAL : offsetX / offsetY;

        return Math.abs(result);
    }

    public static almostEqual(index1: number, index2: number): boolean {
        if (index1 == -1 || index2 == -1) {
            return false;
        }

        const outPt1 = OutPt.at(index1);
        const outPt2 = OutPt.at(index2);

        return outPt1.point.almostEqual(outPt2.point);
    }

    public static getNeighboarIndex(index: number, isNext: boolean): number {
        const outPt = OutPt.at(index);
        
        if (outPt == null) {
            return -1;
        }

        return isNext ? outPt.next : outPt.prev;
    }

    public static getBottomPt(inputIndex: number): number {
        let outIndex1 = inputIndex;
        let outIndex2 = OutPt.getNeighboarIndex(inputIndex, true);
        let dupsIndex: number = -1;

        while (outIndex2 !== outIndex1) {
            let outPt1: OutPt = OutPt.at(outIndex1);
            let outPt2: OutPt = OutPt.at(outIndex2);

            if (outPt2.point.y > outPt1.point.y) {
                outIndex1 = outIndex2;
                dupsIndex = -1;
            } else if (outPt2.point.y == outPt1.point.y && outPt2.point.x <= outPt1.point.x) {
                if (outPt2.point.x < outPt1.point.x) {
                    dupsIndex = -1;
                    outIndex1 = outIndex2;
                } else if (outPt2.next !== outPt1.current && outPt2.prev !== outPt1.current) {
                    dupsIndex = outIndex2;
                }
            }

            outIndex2 = outPt2.next;
        }

        if (dupsIndex !== -1) {
            const outPt2 = OutPt.at(outIndex2);
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dupsIndex !== outIndex2) {
                let dups: NullPtr<OutPt> = OutPt.at(dupsIndex);

                if (!OutPt.firstIsBottomPt(outPt2, dups)) {
                    outIndex1 = dupsIndex;
                }

                dupsIndex = dups.next;

                dups = OutPt.at(dupsIndex);

                const outPt1 = OutPt.at(outIndex1);
                
                while (!dups.point.almostEqual(outPt1.point)) {
                    dups = OutPt.at(dups.next);
                }

                dupsIndex = dups.current;
            }
        }

        return outIndex1;
    }

    private getDirection(outPt: OutPt): DIRECTION {
        return this.point.x > outPt.point.x ? DIRECTION.LEFT : DIRECTION.RIGHT
    }


    public static firstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
        const dx1p: number = btmPt1.getDistance(false);
        const dx1n: number = btmPt1.getDistance(true);
        const dx2p: number = btmPt2.getDistance(false);
        const dx2n: number = btmPt2.getDistance(true);

        const maxDx: number = Math.max(dx2p, dx2n);

        return dx1p >= maxDx || dx1n >= maxDx;
    }

    private getDiscarded(isRight: boolean, pt: Point<Int32Array>): boolean {
        const next = OutPt.at(this.next);

        if (next == null) {
            return false;
        }

        if (isRight) {
            return next.point.x <= pt.x && next.point.x >= this.point.x && next.point.y === pt.y;
        } else {
            return next.point.x >= pt.x && next.point.x <= this.point.x && next.point.y === pt.y;
        }
    } 

    public get area() {
        let outPt: OutPt = this;
        let result: number = 0;

        do {
            let prevPt: OutPt = OutPt.at(outPt.prev);
            result = result + (prevPt.point.x + outPt.point.x) * (prevPt.point.y - outPt.point.y);
            outPt = OutPt.at(outPt.next);
        } while (outPt != this);

        return result * 0.5;
    }

    public joinHorz(outPt: OutPt, point: Point<Int32Array>, isDiscardLeft: boolean): { op: OutPt, opB: OutPt, isRightOrder: boolean } {
        let op: OutPt = this;
        let opB: OutPt = outPt;

        const direction: DIRECTION = op.getDirection(opB);
        const isRight = direction === DIRECTION.RIGHT;
        const isRightOrder = isDiscardLeft !== isRight;

        while (op.getDiscarded(isRight, point)) {
            op = OutPt.at(op.next);
        }

        if (!isRightOrder && op.point.x !== point.x) {
            op = OutPt.at(op.next);
        }

        opB = op.duplicate(isRightOrder);

        if (!opB.point.almostEqual(point)) {
            op = opB;
            //op1.Pt = Pt;
            op.point.update(point);
            opB = op.duplicate(isRightOrder);
        }

        return { op, opB, isRightOrder };
    }

    public static joinHorz(op1: OutPt, op1b: OutPt, op2: OutPt, op2b: OutPt, Pt: Point<Int32Array>, isDiscardLeft: boolean) {
        const direction1: DIRECTION = op1.getDirection(op1b);
        const direction2: DIRECTION = op2.getDirection(op2b);

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        const join1 = op1.joinHorz(op1b, Pt, isDiscardLeft);
        const join2 = op2.joinHorz(op2b, Pt, isDiscardLeft);

        join1.op.push(join2.op, join1.isRightOrder);
        join1.opB.push(join2.opB, !join1.isRightOrder);

        return true;
    }

    private push(outPt: OutPt, isReverse: boolean): void {
        if (isReverse) {
            this.next = outPt.current;
            outPt.prev = this.current; 
        } else {
            this.prev = outPt.current;
            outPt.next = this.current;
        }
    }

    public static fromPoint(point: Point<Int32Array>): number {
        const result = new OutPt(point);

        result.push(result, true);

        return result.current;
    }
}
