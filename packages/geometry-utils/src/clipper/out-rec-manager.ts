import { join_u16_to_u32, get_u16_from_u32 } from "wasm-nesting";
import { Point } from "../types";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./t-edge";
import { DIRECTION, NullPtr } from "./types";

export default class OutRecManager {
    private polyOuts: OutRec[] = [];

    public createRec(pointer: OutPt) {
        const result: OutRec = new OutRec(this.polyOuts.length, pointer);

        this.polyOuts.push(result);

        return result;
    }

    public getOutRec(idx: number): OutRec {
        let result: OutRec = this.polyOuts[idx];

        while (result.index !== this.polyOuts[result.currentIndex].index) {
            result = this.polyOuts[result.currentIndex];
        }

        return result;
    }

    public getJoinData(horzEdge: TEdge) {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        return this.polyOuts[horzEdge.index].getJoinData(horzEdge.Side, horzEdge.Top, horzEdge.Bot);
    }

    public addOutPt(edge: TEdge, point: Point<Int32Array>): number {
        const isToFront: boolean = edge.Side === DIRECTION.LEFT;
        let outRec: OutRec = null;
        let newOp: OutPt = null;

        if (!edge.isAssigned) {
            newOp = OutPt.fromPoint(point);

            outRec = this.createRec(newOp);
 
            this.setHoleState(outRec, edge);

            edge.index = outRec.currentIndex;
            //nb: do this after SetZ !
        } else {
            outRec = this.getOutRec(edge.index);
            newOp = outRec.addOutPt(isToFront, point);
        }

        return join_u16_to_u32(outRec.index, newOp.index);
    }

    public addLocalMaxPoly(edge1: TEdge, edge2: TEdge, point: Point<Int32Array>, activeEdge: TEdge): void {
        this.addOutPt(edge1, point);

        if (edge2.isWindDeletaEmpty) {
            this.addOutPt(edge2, point);
        }

        if (edge1.index === edge2.index) {
            edge1.unassign();
            edge2.unassign();
            return;
        }

        const firstEdge: TEdge = edge1.index < edge2.index ? edge1 : edge2;
        const secondEdge: TEdge = edge1.index < edge2.index ? edge2 : edge1;

        //get the start and ends of both output polygons ...
        const outRec1: OutRec = this.polyOuts[firstEdge.index];
        const outRec2: OutRec = this.polyOuts[secondEdge.index];
        const holeStateRec: OutRec = this.getHoleStateRec(outRec1, outRec2);
        //join e2 poly onto e1 poly and delete pointers to e2 ...
        outRec1.join(outRec2, firstEdge.Side, secondEdge.Side);

        const side = firstEdge.Side;

        if (holeStateRec === outRec2) {
            if (outRec2.firstLeftIndex !== outRec1.index) {
                outRec1.firstLeftIndex = outRec2.firstLeftIndex;
            }

            outRec1.isHole = outRec2.isHole;
        }

        outRec2.clean();
        outRec2.firstLeftIndex = outRec1.index;
        const OKIdx: number = firstEdge.index;
        const ObsoleteIdx: number = secondEdge.index;
        firstEdge.unassign();
        //nb: safe because we only get here via AddLocalMaxPoly
        secondEdge.unassign();

        let e: TEdge = activeEdge;

        while (e !== null) {
            if (e.index === ObsoleteIdx) {
                e.index = OKIdx;
                e.Side = side;
                break;
            }
            e = e.NextInAEL;
        }

        outRec2.currentIndex = outRec1.currentIndex;
    }

    public fixupOutPolygon(isUseFullRange: boolean): void {
        const outRecCount = this.polyOuts.length;
        let i: number = 0;
        let outRec: OutRec = null;

        for (i = 0; i < outRecCount; ++i) {
            outRec = this.polyOuts[i];

            if (!outRec.isEmpty) {
                outRec.fixupOutPolygon(false, isUseFullRange);
            }
        }
    }

    public fixOrientation(reverseSolution: boolean): void {
        const outRecCount = this.polyOuts.length;
        let i: number = 0;
        let outRec = null;

        for (i = 0; i < outRecCount; ++i) {
            outRec = this.polyOuts[i];

            if (outRec.isEmpty) {
                continue;
            }

            if ((outRec.isHole !== reverseSolution) === outRec.area > 0) {
                outRec.reversePts();
            }
        }
    }

    public buildResult(polygons: Point<Int32Array>[][]): void {
        const polygonCount = this.polyOuts.length;
        let outRec: OutRec = null;
        let polygon: NullPtr<Point<Int32Array>[]> = null;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            outRec = this.polyOuts[i];
            polygon = outRec.export();

            if (polygon !== null) {
                polygons.push(polygon);
            }
        }
    }

    public disposeAllPolyPts(): void {
        const polyCount: number = this.polyOuts.length;
        let outRec: OutRec = null;
        let i: number = 0;

        for (i = 0; i < polyCount; ++i) {
            outRec = this.polyOuts[i];
            outRec.dispose();
        }

        this.polyOuts = [];
    }

    public doSimplePolygons(): void {
        for (let i = 0; i < this.polyOuts.length; ++i) {
            this.polyOuts.concat(this.polyOuts[i].simplify(this.polyOuts.length));
        }
    }

    private setHoleState(outRec: OutRec, tEdge: TEdge): void {
        let isHole: boolean = false;
        let edge: NullPtr<TEdge> = tEdge.PrevInAEL;

        while (edge !== null) {
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
                isHole = !isHole;

                if (outRec.firstLeftIndex === -1) {
                    outRec.firstLeftIndex = this.polyOuts[edge.index].index;
                }
            }

            edge = edge.PrevInAEL;
        }

        if (isHole) {
            outRec.isHole = true;
        }
    }

    public joinCommonEdge(outHash1: number, outHash2: number, isReverseSolution: boolean): void {
        const index1: number = get_u16_from_u32(outHash1, 0);
        const index2: number = get_u16_from_u32(outHash2, 0);
        const outPt1Index: number = get_u16_from_u32(outHash1, 1);
        const outPt2Index: number = get_u16_from_u32(outHash2, 1);
        const outPt1: NullPtr<OutPt> = OutPt.getByIndex(outPt1Index);
        const outPt2: NullPtr<OutPt> = OutPt.getByIndex(outPt2Index);
        const outRec1: NullPtr<OutRec> = this.getOutRec(index1);
        let outRec2: NullPtr<OutRec> = this.getOutRec(index2);

        if (index1 === index2) {
            //instead of joining two polygons, we've just created a new one by
            //splitting one polygon into two.
            outRec1.points = outPt1;
            outRec2 = this.createRec(outPt2);
            outRec2.postInit(isReverseSolution);

            return;
        }

        const holeStateRec: OutRec = this.getHoleStateRec(outRec1, outRec2);
        //joined 2 polygons together ...
        outRec2.clean();
        outRec2.currentIndex = outRec1.currentIndex;
        outRec1.isHole = holeStateRec.isHole;

        if (holeStateRec === outRec2) {
            outRec1.firstLeftIndex = outRec2.firstLeftIndex;
        }

        outRec2.firstLeftIndex = outRec1.index;
    }

    private param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
        let outRec1Index = outRec1.index;
        let outRec2Index = outRec2.index;

        do {
            outRec1Index = this.getFirstLeftIndex(outRec1Index);

            if (outRec1Index == outRec2Index) {
                return true;
            }
        } while (outRec1Index !== -1);

        return false;
    }

    private getFirstLeftIndex(index: number): number {
        return index !== -1 ? this.polyOuts[index].firstLeftIndex : -1;
    }

    private getHoleStateRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        switch (true) {
            case this.param1RightOfParam2(outRec1, outRec2):
                return outRec2;
            case this.param1RightOfParam2(outRec2, outRec1):
                return outRec1;
            default:
                return OutRec.getLowermostRec(outRec1, outRec2);
        }
    }
}