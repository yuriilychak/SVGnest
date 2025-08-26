import { join_u16_to_u32 as join_u16, get_u16_from_u32 as get_u16 } from 'wasm-nesting';
import { Point } from '../types';
import { UNASSIGNED } from './constants';
import { Direction } from './enums';
import { PointI32 } from '../geometry';
export default class OutRec {
    private recData: Int16Array[] = [];
    private pointNeighboars: Int16Array[] = [];
    private points: Point<Int32Array>[] = [];
    private isReverseSolution: boolean = false;
    private isStrictlySimple: boolean = false;

    constructor(isReverseSolution: boolean, isStrictlySimple: boolean) {
        this.isReverseSolution = isReverseSolution;
        this.isStrictlySimple = isStrictlySimple;
    }

    public get strictlySimple(): boolean {
        return this.isStrictlySimple;
    }

    public isUnassigned(index: number): boolean {
        return this.recData[index][0] === UNASSIGNED;
    }

    public currentIndex(index: number): number {
        return this.recData[index][1];
    }

    private setCurrentIndex(index1: number, index2: number): void {
        this.recData[index1][1] = this.recData[index2][1];
    }

    public firstLeftIndex(index: number): number {
        return index !== UNASSIGNED ? this.recData[index][2] : UNASSIGNED;
    }

    private setFirstLeftIndex(index: number, value: number): void {
        this.recData[index][2] = value;
    }

    private getHoleStateRec(index1: number, index2: number): number {
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

    public getJoinData(recIndex: number, direction: Direction, top: Point<Int32Array>, bottom: Point<Int32Array>): number[] {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const index: number =
            direction === Direction.Right
                ? this.prev(this.pointIndex(recIndex))
                : this.pointIndex(recIndex);
        const offPoint = this.pointEqual(index, top) ? bottom : top;

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
        const prevIndex = this.prev(index);
        let outPt: number = prevIndex;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = PointI32.create(this.pointX(outPt), this.pointY(outPt));
            outPt = this.prev(outPt);
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

    public fixDirections(): void {
        for (let i = 0; i < this.recData.length; ++i) {
            this.reverse(i);
        }
    }

    public create(pointIndex: number): number {
        const index = this.recData.length;

        this.recData.push(new Int16Array([pointIndex, index, UNASSIGNED, 0]));

        return index;
    }

    public dispose(): void {
        this.recData.length = 0;
        this.points.length = 0;
        this.pointNeighboars.length = 0;
    }

    private fixupOutPolygonInner(recIndex: number, preserveCollinear: boolean, useFullRange: boolean): number {
        const index = this.pointIndex(recIndex);
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutIndex: number = UNASSIGNED;
        let outPt = index;

        while (true) {
            if (this.prev(outPt) === outPt || this.prev(outPt) === this.next(outPt)) {
                return UNASSIGNED;
            }

            const nextPt = this.next(outPt);
            const prevPt = this.prev(outPt);
            //test for duplicate points and collinear edges ...
            if (
                this.innerEqual(outPt, prevPt) ||
                this.innerEqual(outPt, nextPt) ||
                (PointI32.slopesEqual(this.points[prevPt], this.points[outPt], this.points[nextPt], useFullRange) &&
                    (!preserveCollinear || !this.points[outPt].getBetween(this.points[prevPt], this.points[nextPt])))
            ) {
                lastOutIndex = UNASSIGNED;
                outPt = this.remove(outPt);

                continue;
            }

            if (outPt === lastOutIndex) {
                break;
            }

            if (lastOutIndex === UNASSIGNED) {
                lastOutIndex = outPt;
            }

            outPt = this.next(outPt);
        }

        return outPt;
    }

    public fixOutPolygon(isUseFullRange: boolean) {
        for (let i = 0; i < this.recData.length; ++i) {
            if (!this.isUnassigned(i)) {
                this.setPointIndex(i, this.fixupOutPolygonInner(i, false, isUseFullRange));
            }
        }

        if (this.isStrictlySimple) {
            for (let i = 0; i < this.recData.length; ++i) {
                this.simplify(i);
            }
        }
    }

    private getLowermostRec(outRec1Index: number, outRec2Index: number): number {
        const bIndex1: number = this.getBottomPt(outRec1Index);
        const bIndex2: number = this.getBottomPt(outRec2Index);
        const offsetX = this.pointX(bIndex1) - this.pointX(bIndex2);
        const offsetY = this.pointY(bIndex1) - this.pointY(bIndex2);

        switch (true) {
            case offsetY !== 0:
                return offsetY > 0 ? outRec1Index : outRec2Index;
            case offsetX !== 0:
                return offsetX < 0 ? outRec1Index : outRec2Index;
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
        const op1Prev = this.prev(op1Index);
        const op2Prev = this.prev(op2Index);

        this.push(op2Prev, op1Index, true);
        this.push(op1Prev, op2Index, true);
    }

    private canSplit(index1: number, index2: number): boolean {
        return (
            this.innerEqual(index2, index1) &&
            this.next(index2) != index1 &&
            this.prev(index2) != index1
        );
    }

    private simplify(recIndex: number): void {
        if (this.isUnassigned(recIndex)) {
            return;
        }

        const inputIndex = this.pointIndex(recIndex);
        let currIndex = this.pointIndex(recIndex);
        let splitIndex = UNASSIGNED;

        do //for each Pt in Polygon until duplicate found do ...
        {
            splitIndex = this.next(currIndex);

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

                splitIndex = this.next(splitIndex);
            }

            currIndex = this.next(currIndex);
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

    private postInit(recIndex: number): void {
        this.setHole(recIndex, !this.isHole(recIndex));
        this.setFirstLeftIndex(recIndex, recIndex);

        this.reverse(recIndex);
    }

    private getLength(index: number): number {
        const prevIndex = this.prev(index);

        if (prevIndex === UNASSIGNED) {
            return 0;
        }

        let result: number = 0;
        let outPt: number = prevIndex;

        do {
            ++result;
            outPt = this.next(outPt);
        } while (outPt !== prevIndex);

        return result;
    }

    private join(recIndex1: number, recIndex2: number, side1: Direction, side2: Direction): void {
        const index1: number = this.pointIndex(recIndex1);
        const index2: number = this.pointIndex(recIndex2);
        const prevIndex1: number = this.prev(index1);
        const prevIndex2: number = this.prev(index2);
        const isLeft = side1 === Direction.Left;
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
        return join_u16(recIndex, pointIndex);
    }

    public addOutPt(recIndex: number, isToFront: boolean, point: Point<Int32Array>): number {
        const outRec: number = this.getOutRec(recIndex);
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: number = this.pointIndex(outRec);

        if (isToFront && this.pointEqual(op, point)) {
            return op;
        }

        const prev = this.prev(op);

        if (!isToFront && this.pointEqual(prev, point)) {
            return prev;
        }

        const newIndex = this.createOutPt(point);
        this.push(this.prev(op), newIndex, true);
        this.push(newIndex, op, true);

        if (isToFront) {
            this.setPointIndex(outRec, newIndex);
        }

        return newIndex;
    }

    private pointIn(inputIndex: number, outIndex: number): number {
        //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
        //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
        const outX = this.pointX(outIndex);
        const outY = this.pointY(outIndex);
        let outPt: number = inputIndex;
        let startOutPt: number = outPt;
        let result: number = 0;
        let poly0x: number = 0;
        let poly0y: number = 0;
        let poly1x: number = 0;
        let poly1y: number = 0;
        let d: number = 0;

        while (true) {
            const nextPt = this.next(outPt);
            poly0x = this.pointX(outPt);
            poly0y = this.pointY(outPt);
            poly1x = this.pointX(nextPt);
            poly1y = this.pointY(nextPt);

            if (poly1y === outY) {
                if (poly1x === outX || (poly0y === outY && poly1x > outX === poly0x < outX)) {
                    return UNASSIGNED;
                }
            }

            if (poly0y < outY !== poly1y < outY) {
                const offsetX0 = poly0x - outX;
                const offsetX1 = poly1x - outX;

                if (offsetX0 >= 0 && offsetX1 > 0) {
                    result = 1 - result;
                } else if ((offsetX0 >= 0 && offsetX1 <= 0) || (offsetX0 < 0 && offsetX1 > 0)) {
                    d = offsetX0 * (poly1y - outY) - offsetX1 * (poly0y - outY);

                    if (d === 0) {
                        return UNASSIGNED;
                    }

                    if (d > 0 === poly1y > poly0y) {
                        result = 1 - result;
                    }
                }
            }

            outPt = this.next(outPt);

            if (startOutPt === outPt) {
                break;
            }
        }

        return result;
    }

    private pointIndex(index: number): number {
        return this.recData[index][0];
    }

    private setPointIndex(index: number, value: number): void {
        this.recData[index][0] = value;
    }

    private isHole(index: number): boolean {
        return this.recData[index][3] === 1;
    }

    private setHole(index: number, value: boolean): void {
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

            currIndex = this.next(currIndex);
        } while (currIndex !== index2);

        return true;
    }

    private reverse(index: number): void {
        if (!this.isUnassigned(index) && (this.isHole(index) !== this.isReverseSolution) === this.getArea(index) > 0) {
            this.reverseInner(this.pointIndex(index));
        }
    }

    private getArea(recIndex: number): number {
        const index = this.pointIndex(recIndex);
        let outPt: number = index;
        let result: number = 0;

        do {
            let prevPt: number = this.prev(outPt);
            result = result + (this.pointX(prevPt) + this.pointX(outPt)) * (this.pointY(prevPt) - this.pointY(outPt));
            outPt = this.next(outPt);
        } while (outPt != index);

        return result * 0.5;
    }

    private getBottomPt(recIndex: number): number {
        const inputIndex = this.pointIndex(recIndex);
        let outIndex1 = inputIndex;
        let outIndex2 = this.next(inputIndex);
        let dupsIndex: number = UNASSIGNED;

        while (outIndex2 !== outIndex1) {
            if (this.pointY(outIndex2) > this.pointY(outIndex1)) {
                dupsIndex = UNASSIGNED;
                outIndex1 = outIndex2;
            } else if (this.pointY(outIndex2) == this.pointY(outIndex1) && this.pointX(outIndex2) <= this.pointX(outIndex1)) {
                if (this.pointX(outIndex2) < this.pointX(outIndex1)) {
                    dupsIndex = UNASSIGNED;
                    outIndex1 = outIndex2;
                } else if (this.next(outIndex2) !== outIndex1 && this.prev(outIndex2) !== outIndex1) {
                    dupsIndex = outIndex2;
                }
            }

            outIndex2 = this.next(outIndex2);
        }

        if (dupsIndex !== UNASSIGNED) {
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dupsIndex !== outIndex2) {
                if (!this.firstIsBottomPt(outIndex2, dupsIndex)) {
                    outIndex1 = dupsIndex;
                }

                dupsIndex = this.next(dupsIndex);

                while (!this.innerEqual(dupsIndex, outIndex1)) {
                    dupsIndex = this.next(dupsIndex);
                }
            }
        }

        return outIndex1;
    }

    private searchBottom(index: number, outIndex1: number, outIndex2: number, isNext: boolean): number {
        let currIndex = index;
        let nghbIndex = this.getNeighboarIndex(currIndex, isNext);

        while (this.pointY(nghbIndex) === this.pointY(currIndex) && nghbIndex !== outIndex1 && nghbIndex !== outIndex2) {
            currIndex = nghbIndex;
            nghbIndex = this.getNeighboarIndex(currIndex, isNext);
        }

        return currIndex;
    }

    public flatHorizontal(index: number, outIndex1: number, outIndex2: number): number[] {
        const outIndex = this.searchBottom(index, index, outIndex2, false);
        const outBIndex = this.searchBottom(index, outIndex, outIndex1, true);
        const outBIndexNext = this.next(outBIndex);

        return outBIndexNext === outIndex || outBIndexNext === outIndex1 ? [UNASSIGNED, UNASSIGNED] : [outIndex, outBIndex];
    }

    public strictlySimpleJoin(index: number, point: Point<Int32Array>): boolean {
        let result = this.next(index);

        while (result !== index && this.pointEqual(result, point)) {
            result = this.next(result);
        }

        return this.pointY(result) > point.y;
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

        while (this.innerEqual(result, index) && result !== index) {
            result = this.getNeighboarIndex(result, isNext);
        }

        return result;
    }

    private reverseInner(index: number): void {
        let pp1: number = index;

        do {
            const pp2 = this.next(pp1);
            this.setNext(pp1, this.prev(pp1));
            this.setPrev(pp1, pp2);
            pp1 = pp2;
        } while (pp1 !== index);
    }

    private remove(index: number): number {
        const result = this.prev(index);
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

    private joinHorzInt2(point: Point<Int32Array>, index1: number, index2: number): boolean {
        point.x = this.pointX(index1);
        point.y = this.pointY(index1);

        return this.pointX(index1) > this.pointX(index2);
    }

    public joinHorz(
        op1Index: number,
        op1bIndex: number,
        op2Index: number,
        op2bIndex: number,
        leftBound: number,
        rightBound: number
    ): boolean {
        const direction1: Direction = this.getDirection(op1Index, op1bIndex);
        const direction2: Direction = this.getDirection(op2Index, op2bIndex);

        if (direction1 === direction2) {
            return false;
        }

        const point = PointI32.create();
        let isDiscardLeft: boolean = false;

        if (this.pointX(op1Index) >= leftBound && this.pointX(op1Index) <= rightBound) {
            //Pt = op1.Pt;
            isDiscardLeft = this.joinHorzInt2(point, op1Index, op1bIndex);
        } else if (this.pointX(op2Index) >= leftBound && this.pointX(op2Index) <= rightBound) {
            //Pt = op2.Pt;
            isDiscardLeft = this.joinHorzInt2(point, op2Index, op2bIndex);
        } else if (this.pointX(op1bIndex) >= leftBound && this.pointX(op1bIndex) <= rightBound) {
            //Pt = op1b.Pt;
            isDiscardLeft = this.joinHorzInt2(point, op1bIndex, op1Index);
        } else {
            //Pt = op2b.Pt;
            isDiscardLeft = this.joinHorzInt2(point, op2bIndex, op2Index);
        }

        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        const join1 = this.joinHorzInt(op1Index, op1bIndex, point, isDiscardLeft);
        const join2 = this.joinHorzInt(op2Index, op2bIndex, point, isDiscardLeft);

        this.push(join1.op, join2.op, join1.isRightOrder);
        this.push(join1.opB, join2.opB, !join1.isRightOrder);

        return true;
    }

    private joinHorzInt(
        index1: number,
        index2: number,
        point: Point<Int32Array>,
        isDiscardLeft: boolean
    ): { op: number; opB: number; isRightOrder: boolean } {
        let op: number = index1;
        let opB: number = index2;

        const direction: Direction = this.getDirection(index1, index2);
        const isRight = direction === Direction.Right;
        const isRightOrder = isDiscardLeft !== isRight;

        while (this.getDiscarded(op, isRight, point)) {
            op = this.next(op);
        }

        if (!isRightOrder && this.pointX(op) !== point.x) {
            op = this.next(op);
        }

        opB = this.duplicate(op, isRightOrder);

        if (!this.pointEqual(opB, point)) {
            op = opB;
            //op1.Pt = Pt;
            this.pointEqual(op, point);
            opB = this.duplicate(op, isRightOrder);
        }

        return { op, opB, isRightOrder };
    }

    private getDiscarded(index: number, isRight: boolean, pt: Point<Int32Array>): boolean {
        if (this.next(index) === UNASSIGNED) {
            return false;
        }

        const next = this.next(index);
        const nextX = this.pointX(next);
        const currX = this.pointX(index);
        const nextY = this.pointY(next);

        return isRight ? nextX <= pt.x && nextX >= currX && nextY === pt.y : nextX >= pt.x && nextX <= currX && nextY === pt.y;
    }

    private getDirection(index1: number, index2: number): Direction {
        return this.pointX(index1) > this.pointX(index2) ? Direction.Left : Direction.Right;
    }

    private getDistance(inputIndex: number, isNext: boolean): number {
        let index = this.getNeighboarIndex(inputIndex, isNext);

        if (index === UNASSIGNED) {
            return Number.NaN;
        }

        while (this.innerEqual(inputIndex, index) && index !== inputIndex) {
            index = this.getNeighboarIndex(index, isNext);

            if (index === UNASSIGNED) {
                return Number.NaN;
            }
        }

        const offsetY: number = this.pointY(index) - this.pointY(inputIndex);
        const offsetX: number = this.pointX(index) - this.pointX(inputIndex);
        const result = offsetY === 0 ? Number.MIN_SAFE_INTEGER : offsetX / offsetY;

        return Math.abs(result);
    }

    public point(index: number): Point<Int32Array> {
        return this.points[index];
    }

    public pointX(index: number): number {
        return this.points[index].x;
    }

    public pointY(index: number): number {
        return this.points[index].y;
    }

    private createOutPt(point: Point<Int32Array>): number {
        const index = this.points.length;
        this.points.push(PointI32.from(point));
        this.pointNeighboars.push(new Int16Array([UNASSIGNED, UNASSIGNED]));

        return index;
    }

    private duplicate(index: number, isInsertAfter: boolean): number {
        const result: number = this.createOutPt(this.points[index]);

        if (isInsertAfter) {
            this.push(result, this.next(index), true);
            this.push(index, result, true);
        } else {
            this.push(this.prev(index), result, true);
            this.push(result, index, true);
        }

        return result;
    }

    private next(index: number): number {
        return this.getNeighboarIndex(index, true);
    }

    private setNext(index: number, value: number): void {
        if (index !== UNASSIGNED) {
            this.pointNeighboars[index][1] = value;
        }
    }

    private prev(index: number): number {
        return this.getNeighboarIndex(index, false);
    }

    private setPrev(index: number, value: number): void {
        if (index !== UNASSIGNED) {
            this.pointNeighboars[index][0] = value;
        }
    }

    private getNeighboarIndex(index: number, isNext: boolean): number {
        if (index == UNASSIGNED) {
            return UNASSIGNED;
        }

        const neighboarIndex = isNext ? 1 : 0;

        return this.pointNeighboars[index][neighboarIndex];
    }

    private innerEqual(index1: number, index2: number): boolean {
        return index1 != UNASSIGNED && index2 !== UNASSIGNED && this.points[index1].almostEqual(this.points[index2]);
    }

    public pointEqual(index: number, point: Point<Int32Array>): boolean {
        return this.points[index].almostEqual(point);
    }

    private push(outPt1Index: number, outPt2Index: number, isReverse: boolean): void {
        if (isReverse) {
            this.setNext(outPt1Index, outPt2Index);
            this.setPrev(outPt2Index, outPt1Index);
        } else {
            this.setPrev(outPt1Index, outPt2Index);
            this.setNext(outPt2Index, outPt1Index);
        }
    }

    public fromPoint(point: Point<Int32Array>): number {
        const index = this.createOutPt(point);

        this.push(index, index, true);

        return index;
    }

    public joinPolys(firstRecIndex: number, secondRecIndex: number, firstSide: Direction, secondSide: Direction): void {
        const holeStateRec = this.getHoleStateRec(firstRecIndex, secondRecIndex);
        //join e2 poly onto e1 poly and delete pointers to e2 ...
        this.join(firstRecIndex, secondRecIndex, firstSide, secondSide);

        if (holeStateRec === secondRecIndex) {
            if (this.firstLeftIndex(secondRecIndex) !== firstRecIndex) {
                this.setFirstLeftIndex(firstRecIndex, this.firstLeftIndex(secondRecIndex));
            }

            this.setHole(firstRecIndex, this.isHole(secondRecIndex));
        }

        this.setPointIndex(secondRecIndex, UNASSIGNED);
        this.setFirstLeftIndex(secondRecIndex, firstRecIndex);
        this.setCurrentIndex(secondRecIndex, firstRecIndex);
    }

    public joinPolys2(outRec1: number, outRec2: number): void {
        const holeStateRec = this.getHoleStateRec(outRec1, outRec2);
        //joined 2 polygons together ...
        this.setPointIndex(outRec2, UNASSIGNED);
        this.setCurrentIndex(outRec2, outRec1);
        this.setHole(outRec1, this.isHole(holeStateRec));

        if (holeStateRec === outRec2) {
            this.setFirstLeftIndex(outRec1, this.firstLeftIndex(outRec2));
        }

        this.setFirstLeftIndex(outRec2, outRec1);
    }

    public splitPolys(outRec1: number, outPt1Index: number, outPt2Index: number): number {
        //instead of joining two polygons, we've just created a new one by
        //splitting one polygon into two.
        this.setPointIndex(outRec1, outPt1Index);
        const outRec2 = this.create(outPt2Index);
        this.postInit(outRec2);

        return outRec2;
    }

    public getOverlap(op1Index: number, op1bIndex: number, op2Index: number, op2bIndex: number): number[] {
        const a1 = this.pointX(op1Index);
        const a2 = this.pointX(op1bIndex);
        const b1 = this.pointX(op2Index);
        const b2 = this.pointX(op2bIndex);

        if (a1 < a2) {
            return b1 < b2
                ? [Math.max(a1, b1), Math.min(a2, b2)]
                : [Math.max(a1, b2), Math.min(a2, b1)];
        }

        return b1 < b2 ? [Math.max(a2, b1), Math.min(a1, b2)] : [Math.max(a2, b2), Math.min(a1, b1)];
    }

    public horizontalJoinPoints(outHash1: number, outHash2: number, offPoint: Point<Int32Array>): { outHash1: number; outHash2: number; result: boolean } {
        const defaultResult = { outHash1, outHash2, result: false };
        const index1: number = get_u16(outHash1, 0);
        const index2: number = get_u16(outHash2, 0);
        const outPt1Index: number = get_u16(outHash1, 1);
        const outPt2Index: number = get_u16(outHash2, 1);

        if (
            this.pointEqual(outPt1Index, offPoint) &&
            this.pointEqual(outPt2Index, offPoint)
        ) {
            //Strictly Simple join ...
            const reverse1 = this.strictlySimpleJoin(outPt1Index, offPoint);
            const reverse2 = this.strictlySimpleJoin(outPt2Index, offPoint);

            if (reverse1 === reverse2) {
                return defaultResult;
            }

            return {
                outHash1,
                outHash2: join_u16(index2, this.applyJoin(outPt1Index, outPt2Index, reverse1)),
                result: true
            };
        }
        //treat horizontal joins differently to non-horizontal joins since with
        //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
        //may be anywhere along the horizontal edge.
        const [op1Index, op1bIndex] = this.flatHorizontal(outPt1Index, outPt2Index, outPt2Index);

        if (op1Index === UNASSIGNED || op1bIndex === UNASSIGNED) {
            return defaultResult;
        }

        //a flat 'polygon'
        const [op2Index, op2bIndex] = this.flatHorizontal(outPt2Index, op1Index, op1bIndex);

        if (op2Index === UNASSIGNED || op2bIndex === UNASSIGNED) {
            return defaultResult;
        }

        //a flat 'polygon'
        //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

        const [leftBound, rightBound] = this.getOverlap(op1Index, op1bIndex, op2Index, op2bIndex);
        const isOverlapped = leftBound < rightBound;

        if (!isOverlapped) {
            return defaultResult;
        }

        //DiscardLeftSide: when overlapping edges are joined, a spike will created
        //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
        //on the discard Side as either may still be needed for other joins ...

        return {
            outHash1: join_u16(index1, op1Index),
            outHash2: join_u16(index2, op2Index),
            result: this.joinHorz(op1Index, op1bIndex, op2Index, op2bIndex, leftBound, rightBound)
        };
    }
}
