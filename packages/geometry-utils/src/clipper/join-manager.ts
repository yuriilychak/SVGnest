import { PointI32 } from "../geometry";
import Join from "./join";
import OutPt, { OutPtRec } from "./out-pt";
import OutRecManager from "./out-rec-manager";
import TEdge from "./t-edge";
import { CLIP_TYPE, DIRECTION, NullPtr, POLY_FILL_TYPE, POLY_TYPE } from "./types";

export default class JoinManager {
    private joins: Join[] = [];
    private ghostJoins: Join[] = [];
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private isUseFullRange: boolean = false;
    private outRecManager: OutRecManager;

    constructor(outRecManager: OutRecManager) {
        this.outRecManager = outRecManager;
    }

    public init(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE, isUseFullRange: boolean): void {
        this.clipType = clipType;
        this.fillType = fillType;
        this.isUseFullRange = isUseFullRange;
    }

    private insertJoin(condition: boolean, outPtRec1: OutPtRec, edge: TEdge, point1: PointI32, point2: PointI32 = point1): boolean {
        if (condition) {
            const outPtRec2 = this.outRecManager.addOutPt(edge, point1);
            this.joins.push(new Join(outPtRec1, outPtRec2, point2));
        }  

        return condition;
    }

    static checkHorizontalCondition(edge: TEdge, neighboar: TEdge, isUseFullRange: boolean) {
        return neighboar !== null &&
        neighboar.Curr.almostEqual(edge.Bot) &&
        neighboar.isFilled &&
        neighboar.Curr.y > neighboar.Top.y &&
        TEdge.slopesEqual(edge, neighboar, isUseFullRange)
    }

    static checkSharedCondition(outPt: OutPtRec, edge: TEdge, neighboar: TEdge, isUseFullRange: boolean): boolean {
        return outPt.index !== -1 && JoinManager.checkHorizontalCondition(edge, neighboar, isUseFullRange) && !edge.isWindDeletaEmpty;
    }

    public addHorizontalJoin(outPtRec: OutPtRec, edge: TEdge): void {
        let prevEdge: NullPtr<TEdge> = edge.PrevInAEL;
        let nextEdge: NullPtr<TEdge> = edge.NextInAEL;

        const condition1 = JoinManager.checkHorizontalCondition(edge, prevEdge, this.isUseFullRange);

        this.insertJoin(condition1, outPtRec, prevEdge, edge.Bot);

        if (!condition1) {
            const condition2 = JoinManager.checkHorizontalCondition(edge, nextEdge, this.isUseFullRange);

            this.insertJoin(condition2, outPtRec, nextEdge, edge.Bot);
        }
    }

    public addMinJoin(op: OutPtRec, edge: TEdge, edgePrev: TEdge, point: PointI32): void {
        const condition = edgePrev !== null &&
        edgePrev.isFilled &&
        edgePrev.topX(point.y) === edge.topX(point.y) &&
        TEdge.slopesEqual(edge, edgePrev, this.isUseFullRange) &&
        !edge.isWindDeletaEmpty;

        this.insertJoin(condition, op, edgePrev, point, edge.Top);
    }

    public addLeftJoin(outPt: OutPtRec, leftBound: TEdge) {
        const condition = leftBound.isFilled &&
        leftBound.PrevInAEL !== null &&
        leftBound.PrevInAEL.Curr.x === leftBound.Bot.x &&
        leftBound.PrevInAEL.isFilled &&
        TEdge.slopesEqual(leftBound.PrevInAEL, leftBound, this.isUseFullRange);

        this.insertJoin(condition, outPt, leftBound.PrevInAEL,  leftBound.Bot, leftBound.Top);

    }

    public addRightJoin(outPt: OutPtRec, rightBound: TEdge) {
        const condition =  rightBound.isFilled &&
        rightBound.PrevInAEL.isFilled &&
        TEdge.slopesEqual(rightBound.PrevInAEL, rightBound, this.isUseFullRange);

        this.insertJoin(condition, outPt, rightBound.PrevInAEL, rightBound.Bot, rightBound.Top);
    }

    public addScanbeamJoin(edge1: TEdge, edge2: TEdge): void {
        if (edge1.isFilled && edge2 !== null && edge2.isFilled && edge2.Curr.x === edge1.Curr.x) {
            const outPt1 = this.outRecManager.addOutPt(edge2, edge1.Curr);
            const outPt2 = this.outRecManager.addOutPt(edge1, edge1.Curr);

            this.joins.push(new Join(outPt1, outPt2, edge1.Curr));
            //StrictlySimple (type-3) join
        }
    }

    public addSharedJoin(outPt1: OutPtRec, edge1: TEdge) {
        const ePrev: TEdge = edge1.PrevInAEL;
        const eNext: TEdge = edge1.NextInAEL;

        const condition1 = JoinManager.checkSharedCondition(outPt1, edge1, ePrev, this.isUseFullRange);

        if(!this.insertJoin(condition1, outPt1, ePrev,  edge1.Bot, edge1.Top)) {
            const condition2 = JoinManager.checkSharedCondition(outPt1, edge1, eNext, this.isUseFullRange);;
            this.insertJoin(condition2, outPt1, eNext,  edge1.Bot, edge1.Top);
        }
    }

    public addOutputJoins(outPt: OutPtRec, rightBound: TEdge) {
        if (outPt !== null && rightBound.isHorizontal && this.ghostJoins.length > 0 && !rightBound.isWindDeletaEmpty) {
            const joinCount: number = this.ghostJoins.length;
            let i: number = 0;
            let join: Join = null;

            for (i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                join = this.ghostJoins[i];

                if (PointI32.horzSegmentsOverlap(join.outPt1.point, join.offPoint, rightBound.Bot, rightBound.Top)) {
                    this.joins.push(new Join({ index: join.index1, outPt: join.outPt1 }, outPt, join.offPoint));
                }
            }
        }
    }

    public joinCommonEdges(reverseSolution: boolean) {
        let i: number = 0;
        const joinCount: number = this.joins.length;

        for (i = 0; i < joinCount; ++i) {
            this.joinCommonEdge(this.joins[i], reverseSolution);
        }
    }

    public reset() {
        this.joins.length = 0;
        this.ghostJoins.length = 0;
    }

    public prepareHorzJoins(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        if (isTopOfScanbeam) {
            //get the last Op for this horizontal edge
            //the point may be anywhere along the horizontal ...
            const { outPtRec, offPoint } = this.outRecManager.getJoinData(horzEdge);

            this.ghostJoins.push(new Join(outPtRec, { index: -1, outPt: null }, offPoint));
        }
    }

    public clearGhostJoins() {
        this.ghostJoins.length = 0;
    }

    public addLocalMinPoly(edge1: TEdge, edge2: TEdge, point: PointI32): OutPtRec {
        let result: OutPtRec = null;
        let edge: TEdge = null;
        let edgePrev: TEdge;

        if (edge2.isHorizontal || edge1.Dx > edge2.Dx) {
            result = this.outRecManager.addOutPt(edge1, point);
            edge2.index = edge1.index;
            edge2.Side = DIRECTION.RIGHT;
            edge1.Side = DIRECTION.LEFT;
            edge = edge1;
            edgePrev = edge.PrevInAEL === edge2 ? edge2.PrevInAEL : edge.PrevInAEL;
        } else {
            result = this.outRecManager.addOutPt(edge2, point);
            edge1.index = edge2.index;
            edge1.Side = DIRECTION.RIGHT;
            edge2.Side = DIRECTION.LEFT;
            edge = edge2;
            edgePrev = edge.PrevInAEL === edge1 ? edge1.PrevInAEL : edge.PrevInAEL;
        }

        this.addMinJoin(result, edge, edgePrev, point);

        return result;
    }

    public swapEdges(e1Wc: number, e2Wc: number, edge1: TEdge, edge2: TEdge, point: PointI32) {
        let e1Wc2: number = 0;
        let e2Wc2: number = 0;

        switch (this.fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                e1Wc2 = edge1.WindCnt2;
                e2Wc2 = edge2.WindCnt2;
                break;
            case POLY_FILL_TYPE.NEGATIVE:
                e1Wc2 = -edge1.WindCnt2;
                e2Wc2 = -edge2.WindCnt2;
                break;
            default:
                e1Wc2 = Math.abs(edge1.WindCnt2);
                e2Wc2 = Math.abs(edge2.WindCnt2);
                break;
        }

        
        if (edge1.PolyTyp !== edge2.PolyTyp) {
            this.addLocalMinPoly(edge1, edge2, point);
        } else if (e1Wc === 1 && e2Wc === 1) {
            switch (this.clipType) {
                case CLIP_TYPE.UNION:
                    if (e1Wc2 <= 0 && e2Wc2 <= 0) {
                        this.addLocalMinPoly(edge1, edge2, point);
                    }
                    break;
                case CLIP_TYPE.DIFFERENCE:
                    if (
                        (edge1.PolyTyp === POLY_TYPE.CLIP && Math.min(e1Wc2, e2Wc2) > 0) ||
                        (edge1.PolyTyp === POLY_TYPE.SUBJECT && Math.max(e1Wc2, e2Wc2) <= 0)
                    ) {
                        this.addLocalMinPoly(edge1, edge2, point);
                    }
                    break;
            }
        } else {
            TEdge.swapSides(edge1, edge2);
        }
    }

    private joinCommonEdge(join: Join, isReverseSolution: boolean): void {
        if (!this.joinPoints(join)) {
            return;
        }

        //get the polygon fragment with the correct hole state (FirstLeft)
        //before calling JoinPoints() ...
        this.outRecManager.joinCommonEdge(join.index1, join.index2, join.outPt1, join.outPt2, isReverseSolution);
    }

    private joinPoints(join: Join): boolean {
        const outRec1 = this.outRecManager.getOutRec(join.index1);
        const outRec2 = this.outRecManager.getOutRec(join.index2);
        
        if (outRec1.isEmpty || outRec2.isEmpty) {
            return false;
        }

        const isRecordsSame = outRec1.index === outRec2.index;
        //There are 3 kinds of joins for output polygons ...
        //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
        //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
        //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
        //location at the Bottom of the overlapping segment (& Join.OffPt is above).
        //3. StrictlySimple joins where edges touch but are not collinear and where
        //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
        const isHorizontal: boolean = join.outPt1.point.y === join.offPoint.y;

        if (isHorizontal && join.offPoint.almostEqual(join.outPt1.point) && join.offPoint.almostEqual(join.outPt2.point)) {
            //Strictly Simple join ...
            const op1b = join.outPt1.strictlySimpleJoin(join.offPoint);
            const op2b = join.outPt2.strictlySimpleJoin(join.offPoint);

            const reverse1: boolean = op1b.point.y > join.offPoint.y;
            const reverse2: boolean = op2b.point.y > join.offPoint.y;

            if (reverse1 === reverse2) {
                return false;
            }

            join.outPt2 = join.outPt1.applyJoin(join.outPt2, reverse1);

            return true;
        } else if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            const outPt1Res = join.outPt1.flatHorizontal(join.outPt2, join.outPt2);

            if (outPt1Res.length === 0) {
                return false;
            }

            const [op1, op1b] = outPt1Res;
            //a flat 'polygon'
            const outPt2Res = join.outPt2.flatHorizontal(op1, op1b);

            if (outPt2Res.length === 0) {
                return false;
            }

            const [op2, op2b] = outPt2Res;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value = PointI32.getOverlap(op1.point.x, op1b.point.x, op2.point.x, op2b.point.x);
            const isOverlapped = value.x < value.y;

            if (!isOverlapped) {
                return false;
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
            join.outPt1 = op1;
            join.outPt2 = op2;

            return OutPt.joinHorz(op1, op1b, op2, op2b, point, discardLeftSide);
        } else {
            let op1 = join.outPt1;
            let op2 = join.outPt2;
            let op1b: OutPt = op1.getUniquePt(true);
            let op2b: OutPt = op2.getUniquePt(true);
            //nb: For non-horizontal joins ...
            //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
            //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
            //make sure the polygons are correctly oriented ...

            const reverse1: boolean =
                op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, join.offPoint, this.isUseFullRange);

            if (reverse1) {
                op1b = op1.getUniquePt(false);

                if (op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, join.offPoint, this.isUseFullRange)) {
                    return false;
                }
            }

            const reverse2: boolean =
                op2b.point.y > op2.point.y || !PointI32.slopesEqual(op2.point, op2b.point, join.offPoint, this.isUseFullRange);

            if (reverse2) {
                op2b = op2.getUniquePt(false);

                if (op2b.point.y > op2.point.y || !PointI32.slopesEqual(op2.point, op2b.point, join.offPoint, this.isUseFullRange)) {
                    return false;
                }
            }

            if (op1b === op1 || op2b === op2 || op1b === op2b || (isRecordsSame && reverse1 === reverse2)) {
                return false;
            }

            join.outPt2 = join.outPt1.applyJoin(join.outPt2, reverse1);

            return true;
        }
    }
}