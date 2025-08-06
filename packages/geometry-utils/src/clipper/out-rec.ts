import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from '../types';
import { HORIZONTAL, UNASSIGNED } from './constants';
import { DIRECTION } from './types';
import OutPt from './out-pt';
import { PointI32 } from '../geometry';

export default class OutRec {
    private recData: Int16Array[] = [];
    private points: OutPt[] = [];
    private pointNeighboars: Int16Array[] = [];

    public at(index: number): OutPt | null {
        return index >= 0 && index < this.points.length ? this.points[index] : null;
    }

    public pointIndex(index: number): number {
        return this.recData[index][0];
    }

    public setPointIndex(index: number, value: number): void {
        this.recData[index][0] = value;
    }

    public isUnassigned(index: number): boolean {
        return this.recData[index][0] === UNASSIGNED;
    }

    public currentIndex(index: number): number {
        return this.recData[index][1];
    }

    public setCurrentIndex(index1: number, index2: number): void {
        this.recData[index1][1] = this.recData[index2][1];
    }

    public firstLeftIndex(index: number): number {
        return index !== UNASSIGNED ? this.recData[index][2] : UNASSIGNED;
    }

    public setFirstLeftIndex(index: number, value: number): void {
        this.recData[index][2] = value;
    }

    public isHole(index: number): boolean {
        return this.recData[index][3] === 1;
    }

    public setHole(index: number, value: boolean): void {
        this.recData[index][3] = value ? 1 : 0;
    }

    private param1RightOfParam2(outRec1Index: number, outRec2Index: number): boolean {
        let innerIndex = outRec1Index;

        do {
            innerIndex = this.firstLeftIndex(innerIndex);

            if (innerIndex == outRec2Index) {
                return true;
            }
        } while (innerIndex !== UNASSIGNED);

        return false;
    }

    public getHoleStateRec(index1: number, index2: number): number {
        switch (true) {
            case this.param1RightOfParam2(index1, index2):
                return index2;
            case this.param1RightOfParam2(index2, index1):
                return index1;
            default:
                return this.getLowermostRec(index1, index2);
        }
    }

    public setHoleState(recIndex: number, isHole: boolean, index: number): void {
        if (this.firstLeftIndex(recIndex) === UNASSIGNED && index !== UNASSIGNED) {
            this.setFirstLeftIndex(recIndex, index);
        }

        if (isHole) {
            this.setHole(recIndex, true);
        }
    }

    public getJoinData(recIndex: number, direction: DIRECTION, top: Point<Int32Array>, bottom: Point<Int32Array>): number[] {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const index: number = direction === DIRECTION.RIGHT
            ? this.getNeighboarIndex(this.pointIndex(recIndex), false)
            : this.pointIndex(recIndex);
        const outPt = this.at(index);
        const offPoint = outPt.point.almostEqual(top) ? bottom : top;

        return [this.getHash(recIndex, index), offPoint.x, offPoint.y];
    }

    public getOutRec(index: number): number {
        let result: number = index;

        while (result !== this.currentIndex(result)) {
            result = this.currentIndex(result);
        }

        return result;
    }

    private export(recIndex: number): Point<Int32Array>[] {
        const index = this.pointIndex(recIndex);
        const pointCount = this.getLength(index);

        if (pointCount < 2) {
            return [];
        }

        const result: Point<Int32Array>[] = new Array(pointCount);
        const prevIndex = this.getNeighboarIndex(index, false);
        let outPt: OutPt = this.at(prevIndex);
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point.clone();
            outPt = this.at(this.prev(outPt.current));
        }

        return result;
    }

    public buildResult(polygons: Point<Int32Array>[][]): void {
        for (let i = 0; i < this.recData.length; ++i) {
            const polygon = this.isUnassigned(i) ? [] : this.export(i);

            if (polygon.length !== 0) {
                polygons.push(polygon);
            }
        }
    }

    public fixDirections(isReverseSolution: boolean): void {
        for (let i = 0; i < this.recData.length; ++i) {
            this.reverse(i, isReverseSolution);
        }
    }

    public dispose(): void {
        this.recData.length = 0;
        this.points.length = 0;
    }

    private fixupOutPolygonInner(recIndex: number, preserveCollinear: boolean, useFullRange: boolean): number {
        const index = this.pointIndex(recIndex);
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutIndex: number = UNASSIGNED;
        let outPt = this.at(index);

        while (true) {
            if (this.prev(outPt.current) === outPt.current || this.prev(outPt.current) === this.next(outPt.current)) {
                return UNASSIGNED;
            }

            const nextPt = this.at(this.next(outPt.current));
            const prevPt = this.at(this.prev(outPt.current));
            //test for duplicate points and collinear edges ...
            if (
                this.almostEqual(outPt.current, prevPt.current) ||
                this.almostEqual(outPt.current, nextPt.current) ||
                (PointI32.slopesEqual(prevPt.point, outPt.point, nextPt.point, useFullRange) &&
                    (!preserveCollinear || !outPt.point.getBetween(prevPt.point, nextPt.point)))
            ) {
                lastOutIndex = UNASSIGNED;
                outPt = this.remove(outPt.current);

                continue;
            }

            if (outPt.current === lastOutIndex) {
                break;
            }

            if (lastOutIndex === UNASSIGNED) {
                lastOutIndex = outPt.current;
            }

            outPt = this.at(this.next(outPt.current));
        }

        return outPt.current;
    }

    public fixOutPolygon(isStrictlySimple: boolean, isUseFullRange: boolean) {
        for (let i = 0; i < this.recData.length; ++i) {
            if (!this.isUnassigned(i)) {
                this.setPointIndex(i, this.fixupOutPolygonInner(i, false, isUseFullRange));
            }
        }

        if (isStrictlySimple) {
            for (let i = 0; i < this.recData.length; ++i) {
                this.simplify(i);
            }
        }
    }

    private getLowermostRec(outRec1Index: number, outRec2Index: number): number {
        const bIndex1: number = this.getBottomPt(outRec1Index);
        const bIndex2: number = this.getBottomPt(outRec2Index);
        const bPt1: OutPt = this.at(bIndex1);
        const bPt2: OutPt = this.at(bIndex2);

        switch (true) {
            case bPt1.point.y > bPt2.point.y:
                return outRec1Index;
            case bPt1.point.y < bPt2.point.y:
                return outRec2Index;
            case bPt1.point.x < bPt2.point.x:
                return outRec1Index;
            case bPt1.point.x > bPt2.point.x:
                return outRec2Index;
            case bIndex1 === this.next(bIndex1):
                return outRec2Index;
            case bIndex2 === this.next(bIndex2):
                return outRec1Index;
            case this.firstIsBottomPt(bIndex1, bIndex2):
                return outRec1Index;
            default:
                return outRec2Index;
        }
    }

    private split(op1Index: number, op2Index: number): void {
        const op1Prev = this.getNeighboarIndex(op1Index, false);
        const op2Prev = this.getNeighboarIndex(op2Index, false);

        this.push(op2Prev, op1Index, true);
        this.push(op1Prev, op2Index, true);
    }


    private canSplit(index1: number, index2: number): boolean {
        return this.almostEqual(index2, index1) &&
            this.getNeighboarIndex(index2, true) != index1 &&
            this.getNeighboarIndex(index2, false) != index1;
    }

    public simplify(recIndex: number): void {
        if (this.isUnassigned(recIndex)) {
            return;
        }

        const inputIndex = this.pointIndex(recIndex);
        let currIndex = this.pointIndex(recIndex);
        let splitIndex = UNASSIGNED;

        do //for each Pt in Polygon until duplicate found do ...
        {
            splitIndex = this.getNeighboarIndex(currIndex, true);

            while (splitIndex !== this.pointIndex(recIndex)) {
                if (this.canSplit(currIndex, splitIndex)) {
                    //split the polygon into two ...
                    this.split(currIndex, splitIndex);
                    this.setPointIndex(recIndex, currIndex);
                    const outRecIndex = this.create(splitIndex);

                    this.updateSplit(recIndex, outRecIndex);

                    splitIndex = currIndex;
                    //ie get ready for the next iteration
                }

                splitIndex = this.getNeighboarIndex(splitIndex, true);
            }

            currIndex = this.getNeighboarIndex(currIndex, true);
        } while (currIndex != inputIndex);
    }

    private updateSplit(index1: number, index2: number): void {
        if (this.containsPoly(index1, index2)) {
            //OutRec2 is contained by OutRec1 ...
            this.setHole(index2, !this.isHole(index1));
            this.setFirstLeftIndex(index2, index1);
        } else if (this.containsPoly(index2, index1)) {
            //OutRec1 is contained by OutRec2 ...
            this.setHole(index2, this.isHole(index1));
            this.setHole(index1, !this.isHole(index2));
            this.setFirstLeftIndex(index2, this.firstLeftIndex(index1));
            this.setFirstLeftIndex(index1, index2);
        } else {
            //the 2 polygons are separate ...
            this.setHole(index2, this.isHole(index1));
            this.setFirstLeftIndex(index2, this.firstLeftIndex(index1));
        }
    }

    public postInit(recIndex: number, isReverseSolution: boolean): void {
        this.setHole(recIndex, !this.isHole(recIndex));
        this.setFirstLeftIndex(recIndex, recIndex);

        this.reverse(recIndex, isReverseSolution);
    }

    private getLength(index: number): number {
        const prevIndex = this.getNeighboarIndex(index, false);

        if (prevIndex === UNASSIGNED) {
            return 0;
        }

        let result: number = 0;
        let outPt: OutPt = this.at(prevIndex);

        do {
            ++result;
            outPt = this.at(this.next(outPt.current));
        } while (outPt.current !== prevIndex);

        return result;
    }

    public join(recIndex1: number, recIndex2: number, side1: DIRECTION, side2: DIRECTION): void {
        const index1: number = this.pointIndex(recIndex1);
        const index2: number = this.pointIndex(recIndex2);
        const prevIndex1: number = this.getNeighboarIndex(index1, false);
        const prevIndex2: number = this.getNeighboarIndex(index2, false);
        const isLeft = side1 === DIRECTION.LEFT;
        let pointIndex: number;

        if (side1 === side2) {
            this.reverseInner(index2);
            this.push(index2, index1, true);
            this.push(prevIndex1, prevIndex2, true);

            pointIndex = isLeft ? prevIndex2 : index1;
        } else {
            this.push(prevIndex1, index2, true);
            this.push(prevIndex2, index1, true);

            pointIndex = isLeft ? index2 : index1;
        }

        this.setPointIndex(recIndex1, pointIndex);
    }

    public getHash(recIndex: number, pointIndex: number): number {
        return join_u16_to_u32(recIndex, pointIndex);
    }

    private insertBefore(inputPt: OutPt, point: Point<Int32Array>): number {
        const outPt = this.createOutPt(point);
        this.push(this.prev(inputPt.current), outPt.current, true);
        this.push(outPt.current, inputPt.current, true);

        return outPt.current;
    }

    public addOutPt(recIndex: number, isToFront: boolean, point: Point<Int32Array>): number {
        const outRec: number = this.getOutRec(recIndex)
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = this.at(this.pointIndex(outRec));

        if (isToFront && point.almostEqual(op.point)) {
            return op.current;
        }

        const prev = this.at(this.prev(op.current));

        if (!isToFront && point.almostEqual(prev.point)) {
            return prev.current;
        }

        const newIndex = this.insertBefore(op, point);

        if (isToFront) {
            this.setPointIndex(outRec, newIndex);
        }

        return newIndex;
    }

    private pointIn(inputIndex: number, outIndex: number): number {
        let inputPt = this.at(outIndex);
        //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
        //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
        let outPt: OutPt = this.at(inputIndex);
        let startOutPt: OutPt = outPt;
        let result: number = 0;
        let poly0x: number = 0;
        let poly0y: number = 0;
        let poly1x: number = 0;
        let poly1y: number = 0;
        let d: number = 0;

        while (true) {
            const nextPt = this.at(this.next(outPt.current));
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

            outPt = this.at(this.next(outPt.current));

            if (startOutPt.current === outPt.current) {
                break;
            }
        }

        return result;
    }

    private containsPoly(recIndex1: number, recIndex2: number): boolean {
        const index1 = this.pointIndex(recIndex1);
        const index2 = this.pointIndex(recIndex2);

        let currIndex: number = index2;
        let res: number = 0;

        do {
            res = this.pointIn(index1, currIndex);

            if (res >= 0) {
                return res !== 0;
            }

            currIndex = this.getNeighboarIndex(currIndex, true);
        } while (currIndex !== index2);

        return true;
    }

    private reverse(index: number, isReverseSolution: boolean): void {
        if (!this.isUnassigned(index) && (this.isHole(index) !== isReverseSolution) === this.getArea(index) > 0) {
            this.reverseInner(this.pointIndex(index));
        }
    }

    private getArea(recIndex: number): number {
        const index = this.pointIndex(recIndex);
        let outPt: OutPt = this.at(index);
        let result: number = 0;

        do {
            let prevPt: OutPt = this.at(this.prev(outPt.current));
            result = result + (prevPt.point.x + outPt.point.x) * (prevPt.point.y - outPt.point.y);
            outPt = this.at(this.next(outPt.current));
        } while (outPt.current != index);

        return result * 0.5;
    }

    public create(pointIndex: number): number {
        const index = this.recData.length;

        this.recData.push(new Int16Array([pointIndex, index, UNASSIGNED, 0]));

        return index;
    }

    private getBottomPt(recIndex: number): number {
        const inputIndex = this.pointIndex(recIndex);
        let outIndex1 = inputIndex;
        let outIndex2 = this.getNeighboarIndex(inputIndex, true);
        let dupsIndex: number = UNASSIGNED;

        while (outIndex2 !== outIndex1) {
            let outPt1: OutPt = this.at(outIndex1);
            let outPt2: OutPt = this.at(outIndex2);

            if (outPt2.point.y > outPt1.point.y) {
                outIndex1 = outIndex2;
                dupsIndex = UNASSIGNED;
            } else if (outPt2.point.y == outPt1.point.y && outPt2.point.x <= outPt1.point.x) {
                if (outPt2.point.x < outPt1.point.x) {
                    dupsIndex = UNASSIGNED;
                    outIndex1 = outIndex2;
                } else if (this.next(outPt2.current) !== outIndex1 && this.prev(outPt2.current) !== outIndex1) {
                    dupsIndex = outIndex2;
                }
            }

            outIndex2 = this.next(outPt2.current);
        }

        if (dupsIndex !== UNASSIGNED) {
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dupsIndex !== outIndex2) {
                if (!this.firstIsBottomPt(outIndex2, dupsIndex)) {
                    outIndex1 = dupsIndex;
                }

                dupsIndex = this.getNeighboarIndex(dupsIndex, true);

                while (!this.almostEqual(dupsIndex, outIndex1)) {
                    dupsIndex = this.getNeighboarIndex(dupsIndex, true);
                }
            }
        }

        return outIndex1;
    }

    private searchBottom(index: number, outIndex1: number, outIndex2: number, isNext: boolean): number {
        let currIndex = index;
        let nghbIndex = this.getNeighboarIndex(currIndex, isNext);
        let currPt: OutPt = this.at(currIndex);
        let nghbPt: OutPt = this.at(nghbIndex);

        while (nghbPt.point.y === currPt.point.y && nghbIndex !== outIndex1 && nghbIndex !== outIndex2) {
            currIndex = nghbIndex;
            nghbIndex = this.getNeighboarIndex(currIndex, isNext);
            currPt = this.at(currIndex);
            nghbPt = this.at(nghbIndex);
        }

        return currIndex;
    }

    public flatHorizontal(index: number, outIndex1: number, outIndex2: number): number[] {
        const outIndex = this.searchBottom(index, index, outIndex2, false);
        const outBIndex = this.searchBottom(index, outIndex, outIndex1, true);
        const outBIndexNext = this.getNeighboarIndex(outBIndex, true);

        return outBIndexNext === outIndex || outBIndexNext === outIndex1 ? [] : [outIndex, outBIndex];
    }

    public strictlySimpleJoin(index: number, point: Point<Int32Array>): boolean {
        const outPt = this.at(index);
        let result = this.at(this.next(index));

        while (result.current !== outPt.current && result.point.almostEqual(point)) {
            result = this.at(this.next(result.current));
        }

        return result.point.y > point.y;
    }

    public applyJoin(index1: number, index2: number, reverse: boolean): number {
        const op1b = this.duplicate(index1, !reverse);
        const op2b = this.duplicate(index2, reverse);

        if (reverse) {
            this.push(index2, index1, true);
            this.push(op1b, op2b, true);
        } else {
            this.push(index1, index2, true);
            this.push(op2b, op1b, true);
        }

        return op1b;
    }

    public getUniquePt(index: number, isNext: boolean): number {
        let result = this.getNeighboarIndex(index, isNext);

        while (this.almostEqual(result, index) && result !== index) {
            result = this.getNeighboarIndex(result, isNext);
        }

        return result;
    }

    private reverseInner(index: number): void {
        let pp1: OutPt = this.at(index);

        do {
            const pp2 = this.at(this.next(pp1.current));
            this.setNext(pp1.current, this.prev(pp1.current));
            this.setPrev(pp1.current, pp2.current);
            pp1 = pp2;
        } while (pp1.current !== index);
    }

    private remove(index: number): OutPt {
        const result = this.at(this.prev(index));
        this.push(this.prev(index), this.next(index), true);
        this.setPrev(index, UNASSIGNED);
        this.setNext(index, UNASSIGNED);

        return result;
    }

    private firstIsBottomPt(btmIndex1: number, btmIndex2: number): boolean {
        const dx1p: number = this.getDistance(btmIndex1, false);
        const dx1n: number = this.getDistance(btmIndex1, true);
        const dx2p: number = this.getDistance(btmIndex2, false);
        const dx2n: number = this.getDistance(btmIndex2, true);

        const maxDx: number = Math.max(dx2p, dx2n);

        return dx1p >= maxDx || dx1n >= maxDx;
    }

    public joinHorz(op1Index: number, op1bIndex: number, op2Index: number, op2bIndex: number, Pt: Point<Int32Array>, isDiscardLeft: boolean) {
        const direction1: DIRECTION = this.getDirection(op1Index, op1bIndex);
        const direction2: DIRECTION = this.getDirection(op2Index, op2bIndex);

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        const join1 = this.joinHorzInt(op1Index, op1bIndex, Pt, isDiscardLeft);
        const join2 = this.joinHorzInt(op2Index, op2bIndex, Pt, isDiscardLeft);

        this.push(join1.op, join2.op, join1.isRightOrder);
        this.push(join1.opB, join2.opB, !join1.isRightOrder);

        return true;
    }

    private joinHorzInt(index1: number, index2: number, point: Point<Int32Array>, isDiscardLeft: boolean): { op: number, opB: number, isRightOrder: boolean } {
        let op: OutPt = this.at(index1);
        let opB: OutPt = this.at(index2);

        const direction: DIRECTION = this.getDirection(index1, index2);
        const isRight = direction === DIRECTION.RIGHT;
        const isRightOrder = isDiscardLeft !== isRight;

        while (this.getDiscarded(op.current, isRight, point)) {
            op = this.at(this.next(op.current));
        }

        if (!isRightOrder && op.point.x !== point.x) {
            op = this.at(this.next(op.current));
        }

        opB = this.at(this.duplicate(op.current, isRightOrder));

        if (!opB.point.almostEqual(point)) {
            op = opB;
            //op1.Pt = Pt;
            op.point.update(point);
            opB = this.at(this.duplicate(op.current, isRightOrder));
        }

        return { op: op.current, opB: opB.current, isRightOrder };
    }

    public getDiscarded(index: number, isRight: boolean, pt: Point<Int32Array>): boolean {
        if (this.next(index) === UNASSIGNED) {
            return false;
        }

        const outPt = this.at(index);
        const next = this.at(this.next(index));
        const nextX = next.point.x;
        const currX = outPt.point.x;
        const nextY = next.point.y;

        return isRight
            ? nextX <= pt.x && nextX >= currX && nextY === pt.y
            : nextX >= pt.x && nextX <= currX && nextY === pt.y;
    }

    private getDirection(index1: number, index2: number): DIRECTION {
        const outPt1 = this.at(index1);
        const outPt2 = this.at(index2);

        return outPt1.point.x > outPt2.point.x ? DIRECTION.LEFT : DIRECTION.RIGHT
    }

    private getDistance(inputIndex: number, isNext: boolean): number {
        let index = this.getNeighboarIndex(inputIndex, isNext);

        if (index === UNASSIGNED) {
            return Number.NaN;
        }

        while (this.almostEqual(inputIndex, index) && index !== inputIndex) {
            index = this.getNeighboarIndex(index, isNext);

            if (index === UNASSIGNED) {
                return Number.NaN;
            }
        }

        const point: OutPt = this.at(index);
        const outPt = this.at(inputIndex);
        const offsetY: number = point.point.y - outPt.point.y;
        const offsetX: number = point.point.x - outPt.point.x;
        const result = offsetY === 0 ? HORIZONTAL : offsetX / offsetY;

        return Math.abs(result);
    }

    private createOutPt(point: Point<Int32Array>): OutPt {
        const outPt = new OutPt(this.points.length, point);
        this.points.push(outPt);
        this.pointNeighboars.push(new Int16Array([UNASSIGNED, UNASSIGNED]));

        return outPt;
    }

    private duplicate(index: number, isInsertAfter: boolean): number {
        const outPt = this.at(index);
        const result: OutPt = this.createOutPt(outPt.point);

        if (isInsertAfter) {
            this.push(result.current, this.next(index), true);
            this.push(index, result.current, true);
        } else {
            this.push(this.prev(index), result.current, true);
            this.push(result.current, index, true);
        }

        return result.current;
    }

    public next(index: number): number {
        return this.getNeighboarIndex(index, true);
    }

    public setNext(index: number, value: number): void {
        this.setNeighboarIndex(index, true, value);
    }

    public prev(index: number): number {
        return this.getNeighboarIndex(index, false);
    }

    public setPrev(index: number, value: number): void {
        this.setNeighboarIndex(index, false, value);
    }

    private setNeighboarIndex(index: number, isNext: boolean, value: number): void {
        if (index === UNASSIGNED) {
            return;
        }

        const neighboarIndex = isNext ? 1 : 0;

        this.pointNeighboars[index][neighboarIndex] = value;
    }

    private getNeighboarIndex(index: number, isNext: boolean): number {
        if (index == UNASSIGNED) {
            return UNASSIGNED;
        }

        const neighboarIndex = isNext ? 1 : 0;

        return this.pointNeighboars[index][neighboarIndex];
    }

    private almostEqual(index1: number, index2: number): boolean {
        if (index1 == UNASSIGNED || index2 == UNASSIGNED) {
            return false;
        }

        const outPt1 = this.at(index1);
        const outPt2 = this.at(index2);

        return outPt1.point.almostEqual(outPt2.point);
    }

    public push(outPt1Index: number, outPt2Index: number, isReverse: boolean): void {
        if (isReverse) {
            this.setNext(outPt1Index, outPt2Index);
            this.setPrev(outPt2Index, outPt1Index);
        } else {
            this.setPrev(outPt1Index, outPt2Index);
            this.setNext(outPt2Index, outPt1Index);
        }
    }

    public fromPoint(point: Point<Int32Array>): number {
        const outPt = this.createOutPt(point);

        const index = outPt.current;

        this.push(index, index, true);

        return index;
    }
}
