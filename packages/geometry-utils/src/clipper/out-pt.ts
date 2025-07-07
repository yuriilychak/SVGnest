import { Point } from 'src/types';
import { PointI32 } from '../geometry/point';
import { HORIZONTAL } from './constants';
import { DIRECTION, NullPtr } from './types';

export default class OutPt {
    public index: number;

    public readonly point: Point<Int32Array>;

    public next: NullPtr<OutPt>;

    public prev: NullPtr<OutPt>;

    constructor(index: number = 0, point: Point<Int32Array>) {
        this.index = index;
        this.point = PointI32.from(point);
        this.next = null;
        this.prev = null;
    }
    
    public containsPoly(inputOutPt: OutPt): boolean {
        let outPt: OutPt = inputOutPt;
        let res: number = 0;

        do {
            res = this.pointIn(outPt.point);

            if (res >= 0) {
                return res !== 0;
            }

            outPt = outPt.next;
        } while (outPt !== inputOutPt);

        return true;
    }

    public canSplit(outPt: OutPt): boolean {
        return this.point.almostEqual(outPt.point) && outPt.next != this && outPt.prev != this;
    }

    public split(op2: OutPt): OutPt {
        const op3 = this.prev;
        op2.prev.push(this, true);
        op3.push(op2, true);
        

        return op2;
    }

    public export(): NullPtr<Point<Int32Array>[]> {
        const pointCount = this.size;

        if (pointCount < 2) {
            return null;
        }

        const result: Point<Int32Array>[] = new Array(pointCount);
        let outPt: OutPt = this.prev as OutPt;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point.clone();
            outPt = outPt.prev as OutPt;
        }

        return result;
    }

    public get size(): number {
        return this.prev !== null ? this.prev.pointCount : 0;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): NullPtr<OutPt> {
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutPt: NullPtr<OutPt> = null;
        let outPt: NullPtr<OutPt> = this;

        while (true) {
            if (outPt.prev === outPt || outPt.prev === outPt.next) {
                outPt.dispose();

                return null;
            }
            //test for duplicate points and collinear edges ...
            if (
                outPt.point.almostEqual(outPt.next.point) ||
                outPt.point.almostEqual(outPt.prev.point) ||
                (PointI32.slopesEqual(outPt.prev.point, outPt.point, outPt.next.point, useFullRange) &&
                    (!preserveCollinear || !outPt.point.getBetween(outPt.prev.point, outPt.next.point)))
            ) {
                lastOutPt = null;
                outPt = outPt.remove();

                continue;
            }

            if (outPt == lastOutPt) {
                break;
            }

            if (lastOutPt === null) {
                lastOutPt = outPt;
            }

            outPt = outPt.next;
        }

        return outPt;
    }

    public updateIndex(index: number): void {
        let initialPt = this;
        let outPt: OutPt = this;

        do {
            outPt.index = index;
            outPt = outPt.prev;
        } while (outPt !== initialPt);
    }

    public remove(): OutPt {
        const result = this.prev;
        this.prev.push(this.next, true);
        this.prev = null;
        this.next = null;
        
        return result;
    }

    public dispose(): void {
        let outPt: OutPt = this;

        outPt.prev.next = null;

        while (outPt !== null) {
            outPt = outPt.next;
        }
    }

    public duplicate(isInsertAfter: boolean): OutPt {
        const result: OutPt = new OutPt(this.index, this.point);

        if (isInsertAfter) {
            result.push(this.next, true);
            this.push(result, true);
        } else {
            this.prev.push(result, true);
            result.push(this, true);
        }

        return result;
    }

    public insertBefore(index: number, point: Point<Int32Array>): OutPt {
        const outPt = new OutPt(index, point);
        this.prev.push(outPt, true);
        outPt.push(this, true);

        return outPt;
    }

    public get pointCount(): number {
        let result: number = 0;
        let outPt: OutPt = this;

        do {
            ++result;
            outPt = outPt.next;
        } while (outPt !== this);

        return result;
    }

    public reverse(): void {
        let outPt: OutPt = this;
        let pp1: OutPt = outPt;
        let pp2: NullPtr<OutPt> = null;

        do {
            pp2 = pp1.next;
            pp1.next = pp1.prev;
            pp1.prev = pp2;
            pp1 = pp2;
        } while (pp1 !== outPt);
    }

    public getUniquePt(isNext: boolean): OutPt {
        let result = this.getNeighboar(isNext);

        while (result.point.almostEqual(this.point) && result !== this) {
            result = result.getNeighboar(isNext);
        }

        return result;
    }

    private searchPrevBottom(outPt1: OutPt, outPt2: OutPt): OutPt {
        let result: OutPt = this;

        while (result.prev.point.y === result.point.y && result.prev !== outPt1 && result.prev !== outPt2) {
            result = result.prev;
        }

        return result;
    }

    private searchNextBottom(outPt1: OutPt, outPt2: OutPt): OutPt {
        let result: OutPt = this;

        while (result.next.point.y === result.point.y && result.next !== outPt1 && result.next !== outPt2) {
            result = result.next;
        }

        return result;
    }

    public flatHorizontal(outPt1: OutPt, outPt2: OutPt): OutPt[] {
        const outPt = this.searchPrevBottom(this, outPt2);
        const outPtB = this.searchNextBottom(outPt, outPt1);

        return outPtB.next === outPt || outPtB.next === outPt1 ? [] : [outPt, outPtB];
    }

    public strictlySimpleJoin(point: Point<Int32Array>): OutPt {
        let result = this.next;

        while (result !== this && result.point.almostEqual(point)) {
            result = result.next;
        }

        return result;
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
            poly0x = outPt.point.x;
            poly0y = outPt.point.y;
            poly1x = outPt.next.point.x;
            poly1y = outPt.next.point.y;

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

            outPt = outPt.next;

            if (startOutPt == outPt) {
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
        const p1_rt: OutPt = p1_lft.prev;
        const p2_lft: OutPt = outPt;
        const p2_rt: OutPt = p2_lft.prev;

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
        const p1_rt: OutPt = p1_lft.prev;
        const p2_lft: OutPt = outPt;
        const p2_rt: OutPt = p2_lft.prev;

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
        return isNext ? this.next : this.prev;
    }

    private getDistance(isNext: boolean): number {
        let p: OutPt = this.getNeighboar(isNext);

        if(p === null) {
            return Number.NaN;
        }

        while (p.point.almostEqual(this.point) && p !== this) {
            p = p.getNeighboar(isNext);

            if(p === null) {
                return Number.NaN;
            }
        }

        const offsetY: number = p.point.y - this.point.y;
        const offsetX: number = p.point.x - this.point.x;
        const result = offsetY === 0 ? HORIZONTAL : offsetX / offsetY;

        return Math.abs(result);
    }

    public getBottomPt(): OutPt {
        let outPt1: OutPt = this;
        let outPt2: OutPt = this.next;
        let dups: NullPtr<OutPt> = null;

        while (outPt2 !== outPt1) {
            if (outPt2.point.y > outPt1.point.y) {
                outPt1 = outPt2;
                dups = null;
            } else if (outPt2.point.y == outPt1.point.y && outPt2.point.x <= outPt1.point.x) {
                if (outPt2.point.x < outPt1.point.x) {
                    dups = null;
                    outPt1 = outPt2;
                } else if (outPt2.next !== outPt1 && outPt2.prev !== outPt1) {
                    dups = outPt2;
                }
            }
            outPt2 = outPt2.next;
        }
        if (dups !== null) {
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dups !== outPt2) {
                if (!OutPt.firstIsBottomPt(outPt2, dups)) {
                    outPt1 = dups;
                }

                dups = dups.next;
                
                while (!dups.point.almostEqual(outPt1.point)) {
                    dups = dups.next;
                }
            }
        }
        return outPt1;
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
        const next = this.next;

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
            result = result + (outPt.prev.point.x + outPt.point.x) * (outPt.prev.point.y - outPt.point.y);
            outPt = outPt.next;
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
            op = op.next;
        }

        if (!isRightOrder && op.point.x !== point.x) {
            op = op.next;
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
            this.next = outPt;
            outPt.prev = this; 
        } else {
            this.prev = outPt;
            outPt.next = this;
        }
    }

    public static fromPoint(point: Point<Int32Array>): OutPt {
        const result = new OutPt(0, point);

        result.push(result, true);

        return result;
    }
}
