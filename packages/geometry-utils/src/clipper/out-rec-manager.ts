import { join_u16_to_u32, get_u16_from_u32 } from "wasm-nesting";
import { Point } from "../types";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import Join from "./join";
import { DIRECTION } from "./types";
import { PointI32 } from "../geometry";
import { UNASSIGNED } from "./constants";
import TEdge from "./t-edge";
import OutRecController from "./out-rec-controller";

export default class OutRecManager {
    private join: Join = new Join();
    private isReverseSolution: boolean = false;
    private isStrictlySimple: boolean = false;
    private tEdge: TEdge;
    private outRecController = new OutRecController();

    constructor(tEdgeController: TEdge, reverseSolution: boolean, strictlySimple: boolean) {
        this.isReverseSolution = reverseSolution;
        this.isStrictlySimple = strictlySimple;
        this.tEdge = tEdgeController;
    }

    public get strictlySimple(): boolean {
        return this.isStrictlySimple;
    }

    public insertJoin(condition: boolean, outHash1: number, edgeIndex: number, point1: Point<Int32Array>, point2: Point<Int32Array> = point1): boolean {
        if (condition) {
            const outHash2 = this.addOutPt(edgeIndex, point1);
            this.join.add(outHash1, outHash2, point2);
        }

        return condition;
    }

    public addScanbeamJoin(edge1Index: number, edge2Index: number, point: Point<Int32Array>): void {
        const outPt1 = this.addOutPt(edge2Index, point);
        const outPt2 = this.addOutPt(edge1Index, point);

        this.join.add(outPt1, outPt2, point);
        //StrictlySimple (type-3) join
    }

    public addOutputJoins(outHash: number, rightBoundIndex: number): void {
        const joinCount: number = this.join.getLength(true);

        if (joinCount > 0) {
            const point = PointI32.create();

            for (let i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                point.set(
                    this.join.getX(i, true),
                    this.join.getY(i, true)
                )

                if (this.horzSegmentsOverlap(this.join.getHash1(i, true), point, rightBoundIndex)) {
                    this.join.fromGhost(i, outHash);
                }
            }
        }
    }

    public reset() {
        this.join.reset();
    }

    public prepareHorzJoins(horzEdgeIndex: number) {
        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const [outPtHash, x, y] = this.getJoinData(horzEdgeIndex);

        this.join.addGhost(outPtHash, x, y);
    }

    public clearGhostJoins() {
        this.join.clearGhosts();
    }

    public addOutPt(edgeIndex: number, point: Point<Int32Array>): number {
        let outRec: OutRec;
        let pointIndex: number;

        if (!this.tEdge.isAssigned(edgeIndex)) {
            pointIndex = OutPt.fromPoint(point);

            outRec = this.outRecController.createRec(pointIndex);

            this.setHoleState(outRec, edgeIndex);

            this.tEdge.setRecIndex(edgeIndex, outRec.currentIndex);
            //nb: do this after SetZ !
        } else {
            const isToFront: boolean = this.tEdge.side(edgeIndex) === DIRECTION.LEFT;
            const recIndex = this.tEdge.getRecIndex(edgeIndex);
            outRec = this.outRecController.getOutRec(recIndex);

            pointIndex = this.outRecController.addOutPt(recIndex, isToFront, point);
        }

        return this.outRecController.getHash(outRec.index, pointIndex);
    }

    public addLocalMinPoly(edge1Index: number, edge2Index: number, point: Point<Int32Array>): number {
        let firstIndex = edge2Index;
        let secondIndex = edge1Index;
        let result: number = UNASSIGNED;

        if (this.tEdge.isHorizontal(edge2Index) || this.tEdge.dx(edge1Index) > this.tEdge.dx(edge2Index)) {
            firstIndex = edge1Index;
            secondIndex = edge2Index;
        }

        result = this.addOutPt(firstIndex, point);
        this.tEdge.setRecIndex(secondIndex, this.tEdge.getRecIndex(firstIndex));
        this.tEdge.setSide(secondIndex, DIRECTION.RIGHT);
        this.tEdge.setSide(firstIndex, DIRECTION.LEFT);

        const prevIndex = this.tEdge.prevActive(firstIndex) === secondIndex
            ? this.tEdge.prevActive(secondIndex) : this.tEdge.prevActive(firstIndex);
        const condition = this.tEdge.checkMinJoin(firstIndex, prevIndex, point);

        this.insertJoin(condition, result, prevIndex, point, this.tEdge.top(firstIndex));

        return result;
    }

    public addLocalMaxPoly(edge1Index: number, edge2Index: number, point: Point<Int32Array>): void {
        this.addOutPt(edge1Index, point);

        if (this.tEdge.isWindDeletaEmpty(edge2Index)) {
            this.addOutPt(edge2Index, point);
        }

        const recIndex1 = this.tEdge.getRecIndex(edge1Index);
        const recIndex2 = this.tEdge.getRecIndex(edge2Index);

        if (recIndex1 === recIndex2) {
            this.tEdge.unassign(edge1Index);
            this.tEdge.unassign(edge2Index);
            return;
        }

        const condition = recIndex1 < recIndex2;
        const firstIndex = condition ? edge1Index : edge2Index;
        const secondIndex = condition ? edge2Index : edge1Index;
        const firstRecIndex = this.tEdge.getRecIndex(firstIndex);
        const secondRecIndex = this.tEdge.getRecIndex(secondIndex);

        //get the start and ends of both output polygons ...
        const outRec1: OutRec = this.outRecController.at(firstRecIndex);
        const outRec2: OutRec = this.outRecController.at(secondRecIndex);
        const holeStateRec: OutRec = this.outRecController.getHoleStateRec(firstRecIndex, secondRecIndex);
        const firstSide = this.tEdge.side(firstIndex);
        const secondSide = this.tEdge.side(secondIndex);
        //join e2 poly onto e1 poly and delete pointers to e2 ...
        this.outRecController.join(firstRecIndex, secondRecIndex, firstSide, secondSide);

        const side = firstSide;

        if (holeStateRec === outRec2) {
            if (outRec2.firstLeftIndex !== outRec1.index) {
                outRec1.firstLeftIndex = outRec2.firstLeftIndex;
            }

            outRec1.isHole = outRec2.isHole;
        }

        outRec2.pointIndex = UNASSIGNED;
        outRec2.firstLeftIndex = outRec1.index;
        const OKIdx: number = this.tEdge.getRecIndex(firstIndex);
        const ObsoleteIdx: number = this.tEdge.getRecIndex(secondIndex);
        this.tEdge.unassign(firstIndex);
        //nb: safe because we only get here via AddLocalMaxPoly
        this.tEdge.unassign(secondIndex);

        this.tEdge.updateIndexAEL(side, ObsoleteIdx, OKIdx);

        outRec2.currentIndex = outRec1.currentIndex;
    }

    public fixupOutPolygon(): void {
        let i: number = 0;

        this.outRecController.fixDirections(this.isReverseSolution);

        const joinCount: number = this.join.getLength(false);
        const point = PointI32.create();

        for (i = 0; i < joinCount; ++i) {
            point.set(
                this.join.getX(i, false),
                this.join.getY(i, false)
            );
            this.joinCommonEdge(i, point);
        }

        this.outRecController.fixOutPolygon(this.isStrictlySimple, this.tEdge.isUseFullRange);
    }

    public buildResult(polygons: Point<Int32Array>[][]): void {
        return this.outRecController.buildResult(polygons);
    }

    public dispose(): void {
        this.outRecController.dispose();
        OutPt.cleanup();
    }

    private getJoinData(index: number) {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const recIndex = this.tEdge.getRecIndex(index);
        const side = this.tEdge.side(index);
        const top = this.tEdge.top(index);
        const bot = this.tEdge.bot(index);

        return this.outRecController.getJoinData(recIndex, side, top, bot);
    }

    private setHoleState(outRec: OutRec, edgeIndex: number): void {
        const { isHole, index } = this.tEdge.getHoleState(outRec.firstLeftIndex, edgeIndex);

        this.outRecController.setHoleState(outRec.index, isHole, index);
    }

    private joinCommonEdge(index: number, offPoint: Point<Int32Array>): void {
        const inputHash1 = this.join.getHash1(index, false);
        const inputHash2 = this.join.getHash2(index);
        const { outHash1, outHash2, result } = this.joinPoints(inputHash1, inputHash2, offPoint);

        if (!result) {
            this.join.updateHash(index, outHash1, outHash2);
            return;
        }

        //get the polygon fragment with the correct hole state (FirstLeft)
        //before calling JoinPoints() ...

        const index1: number = get_u16_from_u32(outHash1, 0);
        const index2: number = get_u16_from_u32(outHash2, 0);
        const outPt1Index: number = get_u16_from_u32(outHash1, 1);
        const outPt2Index: number = get_u16_from_u32(outHash2, 1);
        const outRec1: OutRec = this.outRecController.getOutRec(index1);
        let outRec2: OutRec = this.outRecController.getOutRec(index2);

        if (index1 === index2) {
            //instead of joining two polygons, we've just created a new one by
            //splitting one polygon into two.
            outRec1.pointIndex = outPt1Index;
            outRec2 = this.outRecController.createRec(outPt2Index);
            this.outRecController.postInit(outRec2.index, this.isReverseSolution);

            this.join.updateHash(index, outHash1, outHash2);
            return;
        }

        const holeStateRec: OutRec = this.outRecController.getHoleStateRec(outRec1.index, outRec2.index);
        //joined 2 polygons together ...
        outRec2.pointIndex = UNASSIGNED;
        outRec2.currentIndex = outRec1.currentIndex;
        outRec1.isHole = holeStateRec.isHole;

        if (holeStateRec === outRec2) {
            outRec1.firstLeftIndex = outRec2.firstLeftIndex;
        }

        outRec2.firstLeftIndex = outRec1.index;

        this.join.updateHash(index, outHash1, outHash2);
    }


    private joinPoints(outHash1: number, outHash2: number, offPoint: Point<Int32Array>): { outHash1: number, outHash2: number, result: boolean } {
        const index1: number = get_u16_from_u32(outHash1, 0);
        const index2: number = get_u16_from_u32(outHash2, 0);
        const outRec1 = this.outRecController.getOutRec(index1);
        const outRec2 = this.outRecController.getOutRec(index2);
        const result = { outHash1, outHash2, result: false };

        if (outRec1.pointIndex === UNASSIGNED || outRec2.pointIndex === UNASSIGNED) {
            return result;
        }

        const outPt1Index: number = get_u16_from_u32(outHash1, 1);
        const outPt2Index: number = get_u16_from_u32(outHash2, 1);
        const outPt1: OutPt = OutPt.at(outPt1Index);
        const outPt2: OutPt = OutPt.at(outPt2Index);
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
            const reverse1 = outPt1.strictlySimpleJoin(offPoint);
            const reverse2 = outPt2.strictlySimpleJoin(offPoint);

            if (reverse1 === reverse2) {
                return result;
            }

            result.outHash2 = join_u16_to_u32(index2, OutPt.applyJoin(outPt1Index, outPt2Index, reverse1));
            result.result = true;

            return result;
        }

        if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            const outPt1Res = outPt1.flatHorizontal(outPt2Index, outPt2Index);

            if (outPt1Res.length === 0) {
                return result;
            }

            const [op1Index, op1bIndex] = outPt1Res;
            const op1: OutPt = OutPt.at(op1Index);
            const op1b: OutPt = OutPt.at(op1bIndex);
            //a flat 'polygon'
            const outPt2Res = outPt2.flatHorizontal(op1Index, op1bIndex);

            if (outPt2Res.length === 0) {
                return result;
            }

            const [op2Index, op2bIndex] = outPt2Res;
            const op2: OutPt = OutPt.at(op2Index);
            const op2b: OutPt = OutPt.at(op2bIndex);
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
            result.outHash1 = join_u16_to_u32(index1, op1Index);
            result.outHash2 = join_u16_to_u32(index2, op2Index);
            result.result = OutPt.joinHorz(op1Index, op1bIndex, op2Index, op2bIndex, point, discardLeftSide);

            return result;
        }

        let op1 = outPt1;
        let op2 = outPt2;
        let op1b: OutPt = OutPt.at(op1.getUniquePt(true));
        let op2b: OutPt = OutPt.at(op2.getUniquePt(true));
        //nb: For non-horizontal joins ...
        //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
        //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
        //make sure the polygons are correctly oriented ...

        const reverse1: boolean = this.tEdge.checkReverse(op1.point, op1b.point, offPoint);

        if (reverse1) {
            op1b = OutPt.at(op1.getUniquePt(false));

            if (this.tEdge.checkReverse(op1.point, op1b.point, offPoint)) {
                return result;
            }
        }

        const reverse2: boolean = this.tEdge.checkReverse(op2.point, op2b.point, offPoint);

        if (reverse2) {
            op2b = OutPt.at(op2.getUniquePt(false));

            if (this.tEdge.checkReverse(op2.point, op2b.point, offPoint)) {
                return result;
            }
        }

        if (op1b === op1 || op2b === op2 || op1b === op2b || (isRecordsSame && reverse1 === reverse2)) {
            return result;
        }

        result.outHash2 = join_u16_to_u32(index2, OutPt.applyJoin(outPt1Index, outPt2Index, reverse1));

        result.result = true;

        return result;
    }

    private horzSegmentsOverlap(outHash: number, offPoint: Point<Int32Array>, edgeIndex: number): boolean {
        const outPtIndex = get_u16_from_u32(outHash, 1);
        const outPt = OutPt.at(outPtIndex);
        const top = this.tEdge.top(edgeIndex);
        const bot = this.tEdge.bot(edgeIndex);

        return PointI32.horzSegmentsOverlap(outPt.point, offPoint, bot, top);
    }
}