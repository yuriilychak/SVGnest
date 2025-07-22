import { Point } from '../types';
import { PointI32 } from '../geometry';
import { HORIZONTAL, UNASSIGNED } from './constants';
import { DIRECTION } from './types';
export default class OutPt {
    private static points: OutPt[] = [];

    public readonly point: Point<Int32Array>;

    public next: number;

    public prev: number;

    public current: number;

    constructor(point: Point<Int32Array>) {
        this.point = PointI32.from(point);
        this.next = UNASSIGNED;
        this.prev = UNASSIGNED;
        this.current = OutPt.points.length;

        OutPt.points.push(this);
    }

    public static at(index: number): OutPt | null {
        return index >= 0 && index < OutPt.points.length ? OutPt.points[index] : null;
    }

    public static cleanup(): void {
        OutPt.points.length = 0;
    }
    
    public static containsPoly(index1: number, index2: number): boolean {
        let currIndex: number = index2;
        let res: number = 0;

        do {
            res = OutPt.pointIn(index1, currIndex);

            if (res >= 0) {
                return res !== 0;
            }

            currIndex = OutPt.getNeighboarIndex(currIndex, true);
        } while (currIndex !== index2);

        return true;
    }

    public static canSplit(index1: number, index2: number): boolean {
        return OutPt.almostEqual(index2, index1) && 
            OutPt.getNeighboarIndex(index2, true) != index1 && 
            OutPt.getNeighboarIndex(index2, false) != index1;
    }

    public static split(op1Index: number, op2Index: number): void {
        const op1Prev = OutPt.getNeighboarIndex(op1Index, false);
        const op2Prev = OutPt.getNeighboarIndex(op2Index, false);

        OutPt.push(op2Prev, op1Index, true);
        OutPt.push(op1Prev, op2Index, true);
    }

    public static export(index: number): Point<Int32Array>[] {
        const pointCount = OutPt.getLength(index);

        if (pointCount < 2) {
            return [];
        }

        const result: Point<Int32Array>[] = new Array(pointCount);
        const prevIndex = OutPt.getNeighboarIndex(index, false);
        let outPt: OutPt = OutPt.at(prevIndex);
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point.clone();
            outPt = OutPt.at(outPt.prev);
        }

        return result;
    }

    public static fixupOutPolygon(index: number, preserveCollinear: boolean, useFullRange: boolean): number {
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutIndex: number = UNASSIGNED;
        let outPt = OutPt.at(index);

        while (true) {
            if (outPt.prev === outPt.current || outPt.prev === outPt.next) {
                return UNASSIGNED;
            }

            const nextPt = OutPt.at(outPt.next);
            const prevPt = OutPt.at(outPt.prev);
            //test for duplicate points and collinear edges ...
            if (
                OutPt.almostEqual(outPt.current, prevPt.current) ||
                OutPt.almostEqual(outPt.current, nextPt.current)  ||
                (PointI32.slopesEqual(prevPt.point, outPt.point, nextPt.point, useFullRange) &&
                    (!preserveCollinear || !outPt.point.getBetween(prevPt.point, nextPt.point)))
            ) {
                lastOutIndex = UNASSIGNED;
                outPt = outPt.remove();

                continue;
            }

            if (outPt.current === lastOutIndex) {
                break;
            }

            if (lastOutIndex === UNASSIGNED) {
                lastOutIndex = outPt.current;
            }

            outPt = OutPt.at(outPt.next);
        }

        return outPt.current;
    }

    public remove(): OutPt {
        const result = OutPt.at(this.prev);
        OutPt.push(this.prev, this.next, true);
        this.prev = UNASSIGNED;
        this.next = UNASSIGNED;
        
        return result;
    }

    public static duplicate(index: number,  isInsertAfter: boolean): number {
        const outPt = OutPt.at(index);
        const result: OutPt = new OutPt(outPt.point);

        if (isInsertAfter) {
            OutPt.push(result.current, outPt.next, true);
            OutPt.push(index, result.current, true);
        } else {
            OutPt.push(outPt.prev, result.current, true);
            OutPt.push(result.current, index, true);
        }

        return result.current;
    }

    public insertBefore(point: Point<Int32Array>): number {
        const outPt = new OutPt(point);
        OutPt.push(this.prev, outPt.current, true);
        OutPt.push(outPt.current, this.current, true);

        return outPt.current;
    }

    public static getLength(index: number): number {
        const prevIndex = OutPt.getNeighboarIndex(index, false);

        if(prevIndex === UNASSIGNED) {
            return 0;
        }

        let result: number = 0;
        let outPt: OutPt = OutPt.at(prevIndex);

        do {
            ++result;
            outPt = OutPt.at(outPt.next);
        } while (outPt.current !== prevIndex);

        return result;
    }

    public get sameAsNext(): boolean {
        return this.current === this.next;
    }

    public static reverse(index: number): void {
        let pp1: OutPt = OutPt.at(index);

        do {
            const pp2 = OutPt.at(pp1.next);
            pp1.next = pp1.prev;
            pp1.prev = pp2.current;
            pp1 = pp2;
        } while (pp1.current !== index);
    }

    public getUniquePt(isNext: boolean): number {
        let result = OutPt.getNeighboarIndex(this.current, isNext);

        while (OutPt.almostEqual(result, this.current) && result !== this.current) {
            result = OutPt.getNeighboarIndex(result, isNext);
        }

        return result;
    }

    private searchBottom(outIndex1: number, outIndex2: number, isNext: boolean): number {
        let currIndex  = this.current;
        let nghbIndex = OutPt.getNeighboarIndex(currIndex, isNext);
        let currPt: OutPt = OutPt.at(currIndex);
        let nghbPt: OutPt = OutPt.at(nghbIndex);

        while (nghbPt.point.y === currPt.point.y && nghbIndex !== outIndex1 && nghbIndex !== outIndex2) {
            currIndex = nghbIndex;
            nghbIndex = OutPt.getNeighboarIndex(currIndex, isNext);
            currPt = OutPt.at(currIndex);
            nghbPt = OutPt.at(nghbIndex);
        }

        return currIndex;
    }

    public flatHorizontal(outIndex1: number, outIndex2: number): number[] {
        const outIndex = this.searchBottom(this.current, outIndex2, false);
        const outBIndex = this.searchBottom(outIndex, outIndex1, true);
        const outBIndexNext = OutPt.getNeighboarIndex(outBIndex, true);

        return outBIndexNext === outIndex || outBIndexNext === outIndex1 ? [] : [outIndex, outBIndex];
    }

    public strictlySimpleJoin(point: Point<Int32Array>): boolean {
        let result = OutPt.at(this.next);

        while (result.current !== this.current && result.point.almostEqual(point)) {
            result = OutPt.at(result.next);
        }

        return result.point.y > point.y;
    }

    public static applyJoin(index1: number, index2: number, reverse: boolean): number {
        const op1b = OutPt.duplicate(index1, !reverse);
        const op2b = OutPt.duplicate(index2, reverse);

        if (reverse) {
            OutPt.push(index2, index1, true);
            OutPt.push(op1b, op2b, true);
        } else {
            OutPt.push(index1, index2, true);
            OutPt.push(op2b, op1b, true);
        }

        return op1b;
    }

    private static pointIn(inputIndex: number, outIndex: number): number {
        let inputPt = OutPt.at(outIndex);
        //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
        //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
        let outPt: OutPt = OutPt.at(inputIndex);
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

            if (poly1y === inputPt.point.y) {
                if (poly1x === inputPt.point.x || (poly0y === inputPt.point.y && poly1x > inputPt.point.x === poly0x < inputPt.point.x)) {
                    return UNASSIGNED;
                }
            }

            if (poly0y < inputPt.point.y !== poly1y < inputPt.point.y) {
                if (poly0x >= inputPt.point.x) {
                    if (poly1x > inputPt.point.x) {
                        result = 1 - result;
                    } else {
                        d = (poly0x - inputPt.point.x) * (poly1y - inputPt.point.y) - (poly1x - inputPt.point.x) * (poly0y - inputPt.point.y);

                        if (d == 0) {
                            return UNASSIGNED;
                        }

                        if (d > 0 === poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                } else {
                    if (poly1x > inputPt.point.x) {
                        d = (poly0x - inputPt.point.x) * (poly1y - inputPt.point.y) - (poly1x - inputPt.point.x) * (poly0y - inputPt.point.y);

                        if (d === 0) {
                            return UNASSIGNED;
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

    public static join(index1: number, index2: number, side1: DIRECTION, side2: DIRECTION): number {
        const prevIndex1: number = OutPt.getNeighboarIndex(index1, false);
        const prevIndex2: number = OutPt.getNeighboarIndex(index2, false);
        const isLeft = side1 === DIRECTION.LEFT;

        if(side1 === side2) {
            OutPt.reverse(index2);
            OutPt.push(index2, index1, true);
            OutPt.push(prevIndex1, prevIndex2, true);

            return isLeft ? prevIndex2 : index1;
        }

        OutPt.push(prevIndex1, index2, true);
        OutPt.push(prevIndex2, index1, true); 

        return isLeft ? index2 : index1;
    }

    private static getDistance(inputIndex: number, isNext: boolean): number {
        let index = OutPt.getNeighboarIndex(inputIndex, isNext);
        
        if(index === UNASSIGNED) {
            return Number.NaN;
        }

        while (OutPt.almostEqual(inputIndex, index) && index !== inputIndex) {
            index = OutPt.getNeighboarIndex(index, isNext);

            if(index === UNASSIGNED) {
                return Number.NaN;
            }
        }

        const point: OutPt = OutPt.at(index);
        const outPt = OutPt.at(inputIndex);
        const offsetY: number = point.point.y - outPt.point.y;
        const offsetX: number = point.point.x - outPt.point.x;
        const result = offsetY === 0 ? HORIZONTAL : offsetX / offsetY;

        return Math.abs(result);
    }

    public static almostEqual(index1: number, index2: number): boolean {
        if (index1 == UNASSIGNED || index2 == UNASSIGNED) {
            return false;
        }

        const outPt1 = OutPt.at(index1);
        const outPt2 = OutPt.at(index2);

        return outPt1.point.almostEqual(outPt2.point);
    }

    public static getNeighboarIndex(index: number, isNext: boolean): number {
        const outPt = OutPt.at(index);
        
        if (index == UNASSIGNED) {
            return UNASSIGNED;
        }

        return isNext ? outPt.next : outPt.prev;
    }

    public static getBottomPt(inputIndex: number): number {
        let outIndex1 = inputIndex;
        let outIndex2 = OutPt.getNeighboarIndex(inputIndex, true);
        let dupsIndex: number = UNASSIGNED;

        while (outIndex2 !== outIndex1) {
            let outPt1: OutPt = OutPt.at(outIndex1);
            let outPt2: OutPt = OutPt.at(outIndex2);

            if (outPt2.point.y > outPt1.point.y) {
                outIndex1 = outIndex2;
                dupsIndex = UNASSIGNED;
            } else if (outPt2.point.y == outPt1.point.y && outPt2.point.x <= outPt1.point.x) {
                if (outPt2.point.x < outPt1.point.x) {
                    dupsIndex = UNASSIGNED;
                    outIndex1 = outIndex2;
                } else if (outPt2.next !== outIndex1 && outPt2.prev !== outIndex1) {
                    dupsIndex = outIndex2;
                }
            }

            outIndex2 = outPt2.next;
        }

        if (dupsIndex !== UNASSIGNED) {
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dupsIndex !== outIndex2) {
                if (!OutPt.firstIsBottomPt(outIndex2, dupsIndex)) {
                    outIndex1 = dupsIndex;
                }

                dupsIndex = OutPt.getNeighboarIndex(dupsIndex, true);
                
                while (!OutPt.almostEqual(dupsIndex, outIndex1)) {
                    dupsIndex = OutPt.getNeighboarIndex(dupsIndex, true);
                }
            }
        }

        return outIndex1;
    }

    private static getDirection(index1: number, index2: number): DIRECTION {
        const outPt1 = OutPt.at(index1);
        const outPt2 = OutPt.at(index2);

        return outPt1.point.x > outPt2.point.x ? DIRECTION.LEFT : DIRECTION.RIGHT
    }


    public static firstIsBottomPt(btmIndex1: number, btmIndex2: number): boolean {
        const dx1p: number = OutPt.getDistance(btmIndex1, false);
        const dx1n: number = OutPt.getDistance(btmIndex1, true);
        const dx2p: number = OutPt.getDistance(btmIndex2, false);
        const dx2n: number = OutPt.getDistance(btmIndex2, true);

        const maxDx: number = Math.max(dx2p, dx2n);

        return dx1p >= maxDx || dx1n >= maxDx;
    }

    private getDiscarded(isRight: boolean, pt: Point<Int32Array>): boolean {
        if (this.next === UNASSIGNED) {
            return false;
        }

        const next = OutPt.at(this.next);
        const nextX = next.point.x;
        const currX = this.point.x;
        const nextY = next.point.y;

        return isRight 
            ? nextX <= pt.x && nextX >= currX && nextY === pt.y 
            : nextX >= pt.x && nextX <= currX && nextY === pt.y;
    } 

    public static getArea(index: number): number {
        let outPt: OutPt = OutPt.at(index);
        let result: number = 0;

        do {
            let prevPt: OutPt = OutPt.at(outPt.prev);
            result = result + (prevPt.point.x + outPt.point.x) * (prevPt.point.y - outPt.point.y);
            outPt = OutPt.at(outPt.next);
        } while (outPt.current != index);

        return result * 0.5;
    }

    public static joinHorzInt(index1: number, index2: number, point: Point<Int32Array>, isDiscardLeft: boolean): { op: number, opB: number, isRightOrder: boolean } {
        let op: OutPt = OutPt.at(index1);
        let opB: OutPt = OutPt.at(index2);

        const direction: DIRECTION = OutPt.getDirection(index1, index2);
        const isRight = direction === DIRECTION.RIGHT;
        const isRightOrder = isDiscardLeft !== isRight;

        while (op.getDiscarded(isRight, point)) {
            op = OutPt.at(op.next);
        }

        if (!isRightOrder && op.point.x !== point.x) {
            op = OutPt.at(op.next);
        }

        opB = OutPt.at(OutPt.duplicate(op.current, isRightOrder));

        if (!opB.point.almostEqual(point)) {
            op = opB;
            //op1.Pt = Pt;
            op.point.update(point);
            opB = OutPt.at(OutPt.duplicate(op.current, isRightOrder));
        }

        return { op: op.current, opB: opB.current, isRightOrder };
    }

    public static joinHorz(op1Index: number, op1bIndex: number, op2Index: number, op2bIndex: number, Pt: Point<Int32Array>, isDiscardLeft: boolean) {
        const direction1: DIRECTION = OutPt.getDirection(op1Index, op1bIndex);
        const direction2: DIRECTION = OutPt.getDirection(op2Index, op2bIndex);

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        const join1 = OutPt.joinHorzInt(op1Index, op1bIndex, Pt, isDiscardLeft);
        const join2 = OutPt.joinHorzInt(op2Index, op2bIndex, Pt, isDiscardLeft);

        OutPt.push(join1.op, join2.op, join1.isRightOrder);
        OutPt.push(join1.opB, join2.opB, !join1.isRightOrder);

        return true;
    }

    private static push(outPt1Index: number, outPt2Index: number, isReverse: boolean): void {
        const outPt1 = OutPt.at(outPt1Index);
        const outPt2 = OutPt.at(outPt2Index);

        if (isReverse) {
            outPt1.next = outPt2Index;
            outPt2.prev = outPt1Index; 
        } else {
            outPt1.prev = outPt2Index;
            outPt2.next = outPt1Index;
        }
    }

    public static fromPoint(point: Point<Int32Array>): number {
        const outPt = new OutPt(point);

        const index = outPt.current;

        OutPt.push(index, index, true);

        return index;
    }
}
