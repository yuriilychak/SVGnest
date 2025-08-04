import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from 'src/types';
import { UNASSIGNED } from './constants';
import OutRec from './out-rec';
import { DIRECTION } from './types';
import OutPt from './out-pt';

export default class OutRecController {
    private polyOuts: OutRec[] = [];

    public at(index: number): OutRec {
        return this.polyOuts[index];
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
            outRec.isHole = true;
        }
    }

    public getJoinData(recIndex: number, direction: DIRECTION, top: Point<Int32Array>, bottom: Point<Int32Array>): number[] {
        const outRec: OutRec = this.polyOuts[recIndex];
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const index: number = direction === DIRECTION.RIGHT
            ? OutPt.getNeighboarIndex(outRec.pointIndex, false)
            : outRec.pointIndex;
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
        const result: OutRec = new OutRec(this.polyOuts.length, pointIndex);

        this.polyOuts.push(result);

        return result;
    }

    public buildResult(polygons: Point<Int32Array>[][]): void {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            const outRec = this.polyOuts[i];
            const polygon = outRec.pointIndex === UNASSIGNED ? [] : OutPt.export(outRec.pointIndex);

            if (polygon.length !== 0) {
                polygons.push(polygon);
            }
        }
    }

    public fixDirections(isReverseSolution: boolean): void {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            const outRec = this.polyOuts[i];

            if (outRec.pointIndex === UNASSIGNED) {
                continue;
            }

            if ((outRec.isHole !== isReverseSolution) === this.area(i) > 0) {
                this.reverse(i);
            }
        }
    }

    public dispose(): void {
        this.polyOuts.length = 0;
    }

    public fixOutPolygon(isStrictlySimple: boolean, isUseFullRange: boolean) {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            const outRec = this.polyOuts[i];

            if (outRec.pointIndex !== UNASSIGNED) {
                outRec.pointIndex = OutPt.fixupOutPolygon(outRec.pointIndex, false, isUseFullRange);
            }
        }

        if (isStrictlySimple) {
            for (let i = 0; i < this.polyOuts.length; ++i) {
                this.polyOuts.concat(this.simplify(i));
            }
        }
    }

    private getLowermostRec(outRec1Index: number, outRec2Index: number): OutRec {
        const outRec1: OutRec = this.polyOuts[outRec1Index];
        const outRec2: OutRec = this.polyOuts[outRec2Index];
        const bIndex1: number = OutPt.getBottomPt(outRec1.pointIndex);
        const bIndex2: number = OutPt.getBottomPt(outRec2.pointIndex);
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

    public simplify(recIndex: number): OutRec[] {
        const inputRec: OutRec = this.polyOuts[recIndex];
        const result: OutRec[] = [];

        if (inputRec.pointIndex === UNASSIGNED) {
            return result;
        }

        const inputIndex = inputRec.pointIndex;
        let innerIndex = this.polyOuts.length;
        let currIndex = inputRec.pointIndex;
        let splitIndex = UNASSIGNED;

        do //for each Pt in Polygon until duplicate found do ...
        {
            splitIndex = OutPt.getNeighboarIndex(currIndex, true);

            while (splitIndex !== inputRec.pointIndex) {
                if (OutPt.canSplit(currIndex, splitIndex)) {
                    //split the polygon into two ...
                    OutPt.split(currIndex, splitIndex);
                    inputRec.pointIndex = currIndex;
                    const outRec = new OutRec(innerIndex, splitIndex);

                    this.updateSplit(inputRec.index, outRec.index);

                    result.push(outRec);

                    splitIndex = currIndex;

                    ++innerIndex;
                    //ie get ready for the next iteration
                }

                splitIndex = OutPt.getNeighboarIndex(splitIndex, true);
            }

            currIndex = OutPt.getNeighboarIndex(currIndex, true);
        } while (currIndex != inputIndex);

        return result;
    }

    private updateSplit(index1: number, index2: number): void {
        const outRec1: OutRec = this.polyOuts[index1];
        const outRec2: OutRec = this.polyOuts[index2];
        if (this.containsPoly(index1, index2)) {
            //OutRec2 is contained by OutRec1 ...
            outRec2.isHole = !outRec1.isHole;
            outRec2.firstLeftIndex = outRec1.index;
        } else if (this.containsPoly(index2, index1)) {
            //OutRec1 is contained by OutRec2 ...
            outRec2.isHole = outRec1.isHole;
            outRec1.isHole = !outRec2.isHole;
            outRec2.firstLeftIndex = outRec1.firstLeftIndex;
            outRec1.firstLeftIndex = outRec2.index;
        } else {
            //the 2 polygons are separate ...
            outRec2.isHole = outRec1.isHole;
            outRec2.firstLeftIndex = outRec1.firstLeftIndex;
        }
    }

    public postInit(recIndex: number, isReverseSolution: boolean): void {
        const outRec: OutRec = this.polyOuts[recIndex];
        outRec.isHole = !outRec.isHole;
        outRec.firstLeftIndex = outRec.index;

        if ((outRec.isHole !== isReverseSolution) === this.area(recIndex) > 0) {
            this.reverse(recIndex);
        }
    }


    public join(index1: number, index2: number, side1: DIRECTION, side2: DIRECTION): void {
        const outRec1: OutRec = this.polyOuts[index1];
        const outRec2: OutRec = this.polyOuts[index2];

        outRec1.pointIndex = OutPt.join(outRec1.pointIndex, outRec2.pointIndex, side1, side2);
    }

    public getHash(recIndex: number, pointIndex: number): number {
        return join_u16_to_u32(recIndex, pointIndex);
    }

    public addOutPt(recIndex: number, isToFront: boolean, point: Point<Int32Array>): number {
        const outRec: OutRec = this.getOutRec(recIndex)
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = OutPt.at(outRec.pointIndex);

        if (isToFront && point.almostEqual(op.point)) {
            return op.current;
        }

        const prev = OutPt.at(op.prev);

        if (!isToFront && point.almostEqual(prev.point)) {
            return prev.current;
        }

        const newIndex = op.insertBefore(point);

        if (isToFront) {
            outRec.pointIndex = newIndex;
        }

        return newIndex;
    }

    private containsPoly(index1: number, index2: number): boolean {
        const outRec1: OutRec = this.polyOuts[index1];
        const outRec2: OutRec = this.polyOuts[index2];
        return OutPt.containsPoly(outRec1.pointIndex, outRec2.pointIndex);
    }

    private reverse(index: number): void {
        const outRec: OutRec = this.polyOuts[index];

        if (outRec.pointIndex !== UNASSIGNED) {
            OutPt.reverse(outRec.pointIndex);
        }
    }

    private area(index: number): number {
        const outRec: OutRec = this.polyOuts[index];

        return outRec.pointIndex === UNASSIGNED ? 0 : OutPt.getArea(outRec.pointIndex);
    }
}
