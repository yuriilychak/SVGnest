import { join_u16_to_u32, get_u16_from_u32 } from "wasm-nesting";
import { Point } from "../types";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./t-edge";
import { DIRECTION, NullPtr } from "./types";
import { PointI32 } from "../geometry";

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

    public joinPoints(outHash1: number, outHash2: number, offPoint: Point<Int32Array>, isUseFullRange: boolean): { outHash1: number, outHash2: number, result: boolean  } {
        const index1: number = get_u16_from_u32(outHash1, 0);
        const index2: number = get_u16_from_u32(outHash2, 0);
        const outRec1 = this.getOutRec(index1);
        const outRec2 = this.getOutRec(index2);
        const result = { outHash1, outHash2, result: false };
        
        if (outRec1.isEmpty || outRec2.isEmpty) {
            return result;
        }

        const outPt1Index: number = get_u16_from_u32(outHash1, 1);
        const outPt2Index: number = get_u16_from_u32(outHash2, 1);
        let outPt1: OutPt = OutPt.getByIndex(outPt1Index);
        let outPt2: OutPt = OutPt.getByIndex(outPt2Index);
        const isRecordsSame = outRec1.index === outRec2.index;
        //There are 3 kinds of joins for output polygons ...
        //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
        //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
        //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
        //location at the Bottom of the overlapping segment (& Join.OffPt is above).
        //3. StrictlySimple joins where edges touch but are not collinear and where
        //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
        const isHorizontal: boolean = outPt1.point.y === offPoint.y;

        if (isHorizontal && offPoint.almostEqual(outPt1.point) && offPoint.almostEqual(outPt2.point)) {
            //Strictly Simple join ...
            const op1b = outPt1.strictlySimpleJoin(offPoint);
            const op2b = outPt2.strictlySimpleJoin(offPoint);

            const reverse1: boolean = op1b.point.y > offPoint.y;
            const reverse2: boolean = op2b.point.y > offPoint.y;

            if (reverse1 === reverse2) {
                return result;
            }

            result.outHash2 = join_u16_to_u32(index2, outPt1.applyJoin(outPt2, reverse1).index);
            result.result = true;

            return result;
        } else if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            const outPt1Res = outPt1.flatHorizontal(outPt2, outPt2);

            if (outPt1Res.length === 0) {
                return result;
            }

            const [op1, op1b] = outPt1Res;
            //a flat 'polygon'
            const outPt2Res = outPt2.flatHorizontal(op1, op1b);

            if (outPt2Res.length === 0) {
                return result;
            }

            const [op2, op2b] = outPt2Res;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value = PointI32.getOverlap(op1.point.x, op1b.point.x, op2.point.x, op2b.point.x);
            const isOverlapped = value.x < value.y;

            if (!isOverlapped) {
                return result;
            }

            //DiscardLeftSide: when overlapping edges are joined, a spike will created
            //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
            //on the discard Side as either may still be needed for other joins ...
            const point = PointI32.create();
            let discardLeftSide: boolean = false;
            if (op1.point.x >= value.x && op1.point.x <= value.y) {
                //Pt = op1.Pt;
                point.update(op1.point);
                discardLeftSide = op1.point.x > op1b.point.x;
            } else if (op2.point.x >= value.x && op2.point.x <= value.y) {
                //Pt = op2.Pt;
                point.update(op2.point);
                discardLeftSide = op2.point.x > op2b.point.x;
            } else if (op1b.point.x >= value.x && op1b.point.x <= value.y) {
                //Pt = op1b.Pt;
                point.update(op1b.point);
                discardLeftSide = op1b.point.x > op1.point.x;
            } else {
                //Pt = op2b.Pt;
                point.update(op2b.point);
                discardLeftSide = op2b.point.x > op2.point.x;
            }
            result.outHash1 = join_u16_to_u32(index1, op1.index);
            result.outHash2 = join_u16_to_u32(index2, op2.index);
            result.result = OutPt.joinHorz(op1, op1b, op2, op2b, point, discardLeftSide);

            return result;
        } else {
            let op1 = outPt1;
            let op2 = outPt2;
            let op1b: OutPt = op1.getUniquePt(true);
            let op2b: OutPt = op2.getUniquePt(true);
            //nb: For non-horizontal joins ...
            //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
            //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
            //make sure the polygons are correctly oriented ...

            const reverse1: boolean =
                op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, offPoint, isUseFullRange);

            if (reverse1) {
                op1b = op1.getUniquePt(false);

                if (op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, offPoint, isUseFullRange)) {
                    return result;
                }
            }

            const reverse2: boolean =
                op2b.point.y > op2.point.y || !PointI32.slopesEqual(op2.point, op2b.point, offPoint, isUseFullRange);

            if (reverse2) {
                op2b = op2.getUniquePt(false);

                if (op2b.point.y > op2.point.y || !PointI32.slopesEqual(op2.point, op2b.point, offPoint, isUseFullRange)) {
                    return result;
                }
            }

            if (op1b === op1 || op2b === op2 || op1b === op2b || (isRecordsSame && reverse1 === reverse2)) {
                return result;
            }

            result.outHash2 = join_u16_to_u32(index2, outPt1.applyJoin(outPt2, reverse1).index);

            result.result = true;

            return result;
        }
    }

    public horzSegmentsOverlap(outHash: number, offPoint: Point<Int32Array>, rightBound: TEdge): boolean {
        const outPtIndex = get_u16_from_u32(outHash, 1);
        const outPt = OutPt.getByIndex(outPtIndex);
        
        return PointI32.horzSegmentsOverlap(outPt.point, offPoint, rightBound.Bot, rightBound.Top);
    }
}