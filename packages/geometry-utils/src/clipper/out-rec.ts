import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from '../types';
import { UNASSIGNED } from './constants';
import { DIRECTION } from './types';
import OutPt from './out-pt';
import { PointI32 } from '../geometry';

export default class OutRec {
    private recData: Int16Array[] = [];

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
            ? OutPt.getNeighboarIndex(this.pointIndex(recIndex), false)
            : this.pointIndex(recIndex);
        const outPt = OutPt.at(index);
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

    private export(index: number): Point<Int32Array>[] {
        const pointCount = this.getLength(index);

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

    public buildResult(polygons: Point<Int32Array>[][]): void {
        for (let i = 0; i < this.recData.length; ++i) {
            const polygon = this.isUnassigned(i) ? [] : this.export(this.pointIndex(i));

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
        this.recData.length = 0;
    }

    private fixupOutPolygonInner(index: number, preserveCollinear: boolean, useFullRange: boolean): number {
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
                OutPt.almostEqual(outPt.current, nextPt.current) ||
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

    public fixOutPolygon(isStrictlySimple: boolean, isUseFullRange: boolean) {
        for (let i = 0; i < this.recData.length; ++i) {
            if (!this.isUnassigned(i)) {
                this.setPointIndex(i, this.fixupOutPolygonInner(this.pointIndex(i), false, isUseFullRange));
            }
        }

        if (isStrictlySimple) {
            for (let i = 0; i < this.recData.length; ++i) {
                this.simplify(i);
            }
        }
    }

    private getLowermostRec(outRec1Index: number, outRec2Index: number): number {
        const bIndex1: number = OutPt.getBottomPt(this.pointIndex(outRec1Index));
        const bIndex2: number = OutPt.getBottomPt(this.pointIndex(outRec2Index));
        const bPt1: OutPt = OutPt.at(bIndex1);
        const bPt2: OutPt = OutPt.at(bIndex2);

        switch (true) {
            case bPt1.point.y > bPt2.point.y:
                return outRec1Index;
            case bPt1.point.y < bPt2.point.y:
                return outRec2Index;
            case bPt1.point.x < bPt2.point.x:
                return outRec1Index;
            case bPt1.point.x > bPt2.point.x:
                return outRec2Index;
            case bPt1.sameAsNext:
                return outRec2Index;
            case bPt2.sameAsNext:
                return outRec1Index;
            case OutPt.firstIsBottomPt(bIndex1, bIndex2):
                return outRec1Index;
            default:
                return outRec2Index;
        }
    }

    private split(op1Index: number, op2Index: number): void {
        const op1Prev = OutPt.getNeighboarIndex(op1Index, false);
        const op2Prev = OutPt.getNeighboarIndex(op2Index, false);

        OutPt.push(op2Prev, op1Index, true);
        OutPt.push(op1Prev, op2Index, true);
    }


    private canSplit(index1: number, index2: number): boolean {
        return OutPt.almostEqual(index2, index1) &&
            OutPt.getNeighboarIndex(index2, true) != index1 &&
            OutPt.getNeighboarIndex(index2, false) != index1;
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
            splitIndex = OutPt.getNeighboarIndex(currIndex, true);

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

                splitIndex = OutPt.getNeighboarIndex(splitIndex, true);
            }

            currIndex = OutPt.getNeighboarIndex(currIndex, true);
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
        const prevIndex = OutPt.getNeighboarIndex(index, false);

        if (prevIndex === UNASSIGNED) {
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


    public join(index1: number, index2: number, side1: DIRECTION, side2: DIRECTION): void {
        const pointIndex = OutPt.join(this.pointIndex(index1), this.pointIndex(index2), side1, side2);

        this.setPointIndex(index1, pointIndex);
    }

    public getHash(recIndex: number, pointIndex: number): number {
        return join_u16_to_u32(recIndex, pointIndex);
    }

    private insertBefore(inputPt: OutPt, point: Point<Int32Array>): number {
        const outPt = new OutPt(point);
        OutPt.push(inputPt.prev, outPt.current, true);
        OutPt.push(outPt.current, inputPt.current, true);

        return outPt.current;
    }

    public addOutPt(recIndex: number, isToFront: boolean, point: Point<Int32Array>): number {
        const outRec: number = this.getOutRec(recIndex)
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = OutPt.at(this.pointIndex(outRec));

        if (isToFront && point.almostEqual(op.point)) {
            return op.current;
        }

        const prev = OutPt.at(op.prev);

        if (!isToFront && point.almostEqual(prev.point)) {
            return prev.current;
        }

        const newIndex = this.insertBefore(op, point);

        if (isToFront) {
            this.setPointIndex(outRec, newIndex);
        }

        return newIndex;
    }

    private containsPoly(recIndex1: number, recIndex2: number): boolean {
        const index1 = this.pointIndex(recIndex1);
        const index2 = this.pointIndex(recIndex2);

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

    private reverse(index: number, isReverseSolution: boolean): void {
        if (!this.isUnassigned(index) && (this.isHole(index) !== isReverseSolution) === this.getArea(index) > 0) {
            OutPt.reverse(this.pointIndex(index));
        }
    }

    private getArea(recIndex: number): number {
        const index = this.pointIndex(recIndex);
        let outPt: OutPt = OutPt.at(index);
        let result: number = 0;

        do {
            let prevPt: OutPt = OutPt.at(outPt.prev);
            result = result + (prevPt.point.x + outPt.point.x) * (prevPt.point.y - outPt.point.y);
            outPt = OutPt.at(outPt.next);
        } while (outPt.current != index);

        return result * 0.5;
    }

    public create(pointIndex: number): number {
        const index = this.recData.length;

        this.recData.push(new Int16Array([pointIndex, index, UNASSIGNED, 0]));

        return index;
    }
}
