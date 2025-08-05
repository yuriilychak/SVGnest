import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from 'src/types';
import { UNASSIGNED } from './constants';
import OutRec from './out-rec';
import { DIRECTION } from './types';
import OutPt from './out-pt';

export default class OutRecController {
    private polyOuts: OutRec[] = [];
    private recData: Int16Array[] = [];

    public at(index: number): OutRec {
        return this.polyOuts[index];
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

    public isHole(index: number): boolean {
        return this.recData[index][3] === 1;
    }

    public setHole(index: number, value: boolean): void {
        this.recData[index][3] = value ? 1 : 0;
    }

    private param1RightOfParam2(outRec1Index: number, outRec2Index: number): boolean {
        let innerIndex = outRec1Index;

        do {
            innerIndex = this.getFirstLeftIndex(innerIndex);

            if (innerIndex == outRec2Index) {
                return true;
            }
        } while (innerIndex !== UNASSIGNED);

        return false;
    }

    private getFirstLeftIndex(index: number): number {
        return index !== UNASSIGNED ? this.polyOuts[index].firstLeftIndex : UNASSIGNED;
    }

    public getHoleStateRec(index1: number, index2: number): OutRec {
        switch (true) {
            case this.param1RightOfParam2(index1, index2):
                return this.polyOuts[index2];
            case this.param1RightOfParam2(index2, index1):
                return this.polyOuts[index1];
            default:
                return this.getLowermostRec(index1, index2);
        }
    }

    public setHoleState(recIndex: number, isHole: boolean, index: number): void {
        const outRec = this.polyOuts[recIndex];

        if (outRec.firstLeftIndex === UNASSIGNED && index !== UNASSIGNED) {
            outRec.firstLeftIndex = this.polyOuts[index].index;
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

    public getOutRec(idx: number): OutRec {
        let result: OutRec = this.polyOuts[idx];

        while (result.index !== this.polyOuts[result.currentIndex].index) {
            result = this.polyOuts[result.currentIndex];
        }

        return result;
    }

    public createRec(pointIndex: number) {
        const result: OutRec = new OutRec(this.polyOuts.length);

        this.polyOuts.push(result);

        this.create(pointIndex)

        return result;
    }

    public buildResult(polygons: Point<Int32Array>[][]): void {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            const polygon = this.isUnassigned(i) ? [] : OutPt.export(this.pointIndex(i));

            if (polygon.length !== 0) {
                polygons.push(polygon);
            }
        }
    }

    public fixDirections(isReverseSolution: boolean): void {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            this.reverse(i, isReverseSolution);
        }
    }

    public dispose(): void {
        this.polyOuts.length = 0;
        this.recData.length = 0;
    }

    public fixOutPolygon(isStrictlySimple: boolean, isUseFullRange: boolean) {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            if (!this.isUnassigned(i)) {
                this.setPointIndex(i, OutPt.fixupOutPolygon(this.pointIndex(i), false, isUseFullRange));
            }
        }

        if (isStrictlySimple) {
            for (let i = 0; i < this.polyOuts.length; ++i) {
                this.simplify(i);
            }
        }
    }

    private getLowermostRec(outRec1Index: number, outRec2Index: number): OutRec {
        const outRec1: OutRec = this.polyOuts[outRec1Index];
        const outRec2: OutRec = this.polyOuts[outRec2Index];
        const bIndex1: number = OutPt.getBottomPt(this.pointIndex(outRec1Index));
        const bIndex2: number = OutPt.getBottomPt(this.pointIndex(outRec2Index));
        const bPt1: OutPt = OutPt.at(bIndex1);
        const bPt2: OutPt = OutPt.at(bIndex2);

        switch (true) {
            case bPt1.point.y > bPt2.point.y:
                return outRec1;
            case bPt1.point.y < bPt2.point.y:
                return outRec2;
            case bPt1.point.x < bPt2.point.x:
                return outRec1;
            case bPt1.point.x > bPt2.point.x:
                return outRec2;
            case bPt1.sameAsNext:
                return outRec2;
            case bPt2.sameAsNext:
                return outRec1;
            case OutPt.firstIsBottomPt(bIndex1, bIndex2):
                return outRec1;
            default:
                return outRec2;
        }
    }

    public simplify(recIndex: number): void {
        if (this.isUnassigned(recIndex)) {
            return;
        }

        const inputRec: OutRec = this.polyOuts[recIndex];
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
                    const outRec = this.createRec(splitIndex);

                    this.updateSplit(inputRec.index, outRec.index);

                    splitIndex = currIndex;
                    //ie get ready for the next iteration
                }

                splitIndex = OutPt.getNeighboarIndex(splitIndex, true);
            }

            currIndex = OutPt.getNeighboarIndex(currIndex, true);
        } while (currIndex != inputIndex);
    }

    private updateSplit(index1: number, index2: number): void {
        const outRec1: OutRec = this.polyOuts[index1];
        const outRec2: OutRec = this.polyOuts[index2];
        if (this.containsPoly(index1, index2)) {
            //OutRec2 is contained by OutRec1 ...
            this.setHole(index2, !this.isHole(index1));
            outRec2.firstLeftIndex = outRec1.index;
        } else if (this.containsPoly(index2, index1)) {
            //OutRec1 is contained by OutRec2 ...
            this.setHole(index2, this.isHole(index1));
            this.setHole(index1, !this.isHole(index2));
            outRec2.firstLeftIndex = outRec1.firstLeftIndex;
            outRec1.firstLeftIndex = outRec2.index;
        } else {
            //the 2 polygons are separate ...
            this.setHole(index2, this.isHole(index1));
            outRec2.firstLeftIndex = outRec1.firstLeftIndex;
        }
    }

    public postInit(recIndex: number, isReverseSolution: boolean): void {
        const outRec: OutRec = this.polyOuts[recIndex];
        this.setHole(recIndex, !this.isHole(recIndex));
        outRec.firstLeftIndex = outRec.index;

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
        const outRec: OutRec = this.getOutRec(recIndex)
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = OutPt.at(this.pointIndex(outRec.index));

        if (isToFront && point.almostEqual(op.point)) {
            return op.current;
        }

        const prev = OutPt.at(op.prev);

        if (!isToFront && point.almostEqual(prev.point)) {
            return prev.current;
        }

        const newIndex = op.insertBefore(point);

        if (isToFront) {
            this.setPointIndex(outRec.index, newIndex);
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

    private create(pointIndex: number): number {
        const index = this.polyOuts.length;

        this.recData.push(new Int16Array([pointIndex, index, UNASSIGNED, 0]));

        return index;
    }
}
