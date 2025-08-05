import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from 'src/types';
import { UNASSIGNED } from './constants';
import { DIRECTION } from './types';
import OutPt from './out-pt';

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

    public buildResult(polygons: Point<Int32Array>[][]): void {
        for (let i = 0; i < this.recData.length; ++i) {
            const polygon = this.isUnassigned(i) ? [] : OutPt.export(this.pointIndex(i));

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

    public fixOutPolygon(isStrictlySimple: boolean, isUseFullRange: boolean) {
        for (let i = 0; i < this.recData.length; ++i) {
            if (!this.isUnassigned(i)) {
                this.setPointIndex(i, OutPt.fixupOutPolygon(this.pointIndex(i), false, isUseFullRange));
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
                if (OutPt.canSplit(currIndex, splitIndex)) {
                    //split the polygon into two ...
                    OutPt.split(currIndex, splitIndex);
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


    public join(index1: number, index2: number, side1: DIRECTION, side2: DIRECTION): void {
        const pointIndex = OutPt.join(this.pointIndex(index1), this.pointIndex(index2), side1, side2);

        this.setPointIndex(index1, pointIndex);
    }

    public getHash(recIndex: number, pointIndex: number): number {
        return join_u16_to_u32(recIndex, pointIndex);
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

        const newIndex = op.insertBefore(point);

        if (isToFront) {
            this.setPointIndex(outRec, newIndex);
        }

        return newIndex;
    }

    private containsPoly(index1: number, index2: number): boolean {
        return OutPt.containsPoly(this.pointIndex(index1), this.pointIndex(index2));
    }

    private reverse(index: number, isReverseSolution: boolean): void {
        if (!this.isUnassigned(index) && (this.isHole(index) !== isReverseSolution) === OutPt.getArea(this.pointIndex(index)) > 0) {
            OutPt.reverse(this.pointIndex(index));
        }
    }

    public create(pointIndex: number): number {
        const index = this.recData.length;

        this.recData.push(new Int16Array([pointIndex, index, UNASSIGNED, 0]));

        return index;
    }
}
