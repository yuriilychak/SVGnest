import { Point } from "src/types";
import { UNASSIGNED } from "./constants";
import OutRec from "./out-rec";
import { DIRECTION } from "./types";



export default class OutRecController {
    private polyOuts: OutRec[] = [];

    public at(index: number): OutRec {
        return this.polyOuts[index];
    }

    private param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
        let outRec1Index = outRec1.index;
        let outRec2Index = outRec2.index;

        do {
            outRec1Index = this.getFirstLeftIndex(outRec1Index);

            if (outRec1Index == outRec2Index) {
                return true;
            }
        } while (outRec1Index !== UNASSIGNED);

        return false;
    }

    private getFirstLeftIndex(index: number): number {
        return index !== UNASSIGNED ? this.polyOuts[index].firstLeftIndex : UNASSIGNED;
    }

    public getHoleStateRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        switch (true) {
            case this.param1RightOfParam2(outRec1, outRec2):
                return outRec2;
            case this.param1RightOfParam2(outRec2, outRec1):
                return outRec1;
            default:
                return OutRec.getLowermostRec(outRec1, outRec2);
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

    public getJoinData(recIndex: number, side: DIRECTION, top: Point<Int32Array>, bot: Point<Int32Array>) {
        return this.polyOuts[recIndex].getJoinData(side, top, bot);
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
            const polygon = outRec.export();

            if (polygon.length !== 0) {
                polygons.push(polygon);
            }
        }
    }

    public fixDirections(isReverseSolution: boolean): void {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            const outRec = this.polyOuts[i];

            if (outRec.isEmpty) {
                continue;
            }

            if ((outRec.isHole !== isReverseSolution) === outRec.area > 0) {
                outRec.reverse();
            }
        }
    }

    public dispose(): void {
        this.polyOuts.length = 0;
    }

    public fixOutPolygon(isStrictlySimple: boolean, isUseFullRange: boolean) {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            const outRec = this.polyOuts[i];

            if (!outRec.isEmpty) {
                outRec.fixupOutPolygon(false, isUseFullRange);
            }
        }

        if (isStrictlySimple) {
            for (let i = 0; i < this.polyOuts.length; ++i) {
                this.polyOuts.concat(this.polyOuts[i].simplify(this.polyOuts.length));
            }
        }
    }
}