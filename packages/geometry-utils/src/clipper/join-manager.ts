import { PointI32 } from "../geometry";
import Join from "./join";
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

    private insertJoin(condition: boolean, outHash1: number, edge: TEdge, point1: PointI32, point2: PointI32 = point1): boolean {
        if (condition) {
            const outHash2 = this.outRecManager.addOutPt(edge, point1);
            this.joins.push(new Join(outHash1, outHash2, point2));
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

    static checkSharedCondition(outHash: number, edge: TEdge, neighboar: TEdge, isUseFullRange: boolean): boolean {
        return outHash !== -1 && JoinManager.checkHorizontalCondition(edge, neighboar, isUseFullRange) && !edge.isWindDeletaEmpty;
    }

    public addHorizontalJoin(outHash: number, edge: TEdge): void {
        let prevEdge: NullPtr<TEdge> = edge.PrevInAEL;
        let nextEdge: NullPtr<TEdge> = edge.NextInAEL;

        const condition1 = JoinManager.checkHorizontalCondition(edge, prevEdge, this.isUseFullRange);

        this.insertJoin(condition1, outHash, prevEdge, edge.Bot);

        if (!condition1) {
            const condition2 = JoinManager.checkHorizontalCondition(edge, nextEdge, this.isUseFullRange);

            this.insertJoin(condition2, outHash, nextEdge, edge.Bot);
        }
    }

    public addMinJoin(outHash: number, edge: TEdge, edgePrev: TEdge, point: PointI32): void {
        const condition = edgePrev !== null &&
        edgePrev.isFilled &&
        edgePrev.topX(point.y) === edge.topX(point.y) &&
        TEdge.slopesEqual(edge, edgePrev, this.isUseFullRange) &&
        !edge.isWindDeletaEmpty;

        this.insertJoin(condition, outHash, edgePrev, point, edge.Top);
    }

    public addLeftJoin(outHash: number, leftBound: TEdge) {
        const condition = leftBound.isFilled &&
        leftBound.PrevInAEL !== null &&
        leftBound.PrevInAEL.Curr.x === leftBound.Bot.x &&
        leftBound.PrevInAEL.isFilled &&
        TEdge.slopesEqual(leftBound.PrevInAEL, leftBound, this.isUseFullRange);

        this.insertJoin(condition, outHash, leftBound.PrevInAEL,  leftBound.Bot, leftBound.Top);

    }

    public addRightJoin(outHash: number, rightBound: TEdge) {
        const condition =  rightBound.isFilled &&
        rightBound.PrevInAEL.isFilled &&
        TEdge.slopesEqual(rightBound.PrevInAEL, rightBound, this.isUseFullRange);

        this.insertJoin(condition, outHash, rightBound.PrevInAEL, rightBound.Bot, rightBound.Top);
    }

    public addScanbeamJoin(edge1: TEdge, edge2: TEdge): void {
        if (edge1.isFilled && edge2 !== null && edge2.isFilled && edge2.Curr.x === edge1.Curr.x) {
            const outPt1 = this.outRecManager.addOutPt(edge2, edge1.Curr);
            const outPt2 = this.outRecManager.addOutPt(edge1, edge1.Curr);

            this.joins.push(new Join(outPt1, outPt2, edge1.Curr));
            //StrictlySimple (type-3) join
        }
    }

    public addSharedJoin(outHash: number, edge1: TEdge) {
        const ePrev: TEdge = edge1.PrevInAEL;
        const eNext: TEdge = edge1.NextInAEL;

        const condition1 = JoinManager.checkSharedCondition(outHash, edge1, ePrev, this.isUseFullRange);

        if(!this.insertJoin(condition1, outHash, ePrev,  edge1.Bot, edge1.Top)) {
            const condition2 = JoinManager.checkSharedCondition(outHash, edge1, eNext, this.isUseFullRange);;
            this.insertJoin(condition2, outHash, eNext,  edge1.Bot, edge1.Top);
        }
    }

    public addOutputJoins(outHash: number, rightBound: TEdge) {
        if (outHash !== -1 && rightBound.isHorizontal && this.ghostJoins.length > 0 && !rightBound.isWindDeletaEmpty) {
            const joinCount: number = this.ghostJoins.length;
           
            let i: number = 0;
            let join: Join = null;

            for (i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                join = this.ghostJoins[i];

                if (this.outRecManager.horzSegmentsOverlap(join.outHash1, join.offPoint, rightBound)) {
                    this.joins.push(new Join(join.outHash1, outHash, join.offPoint));
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
            const { outPtHash, offPoint } = this.outRecManager.getJoinData(horzEdge);

            this.ghostJoins.push(new Join(outPtHash, -1, offPoint));
        }
    }

    public clearGhostJoins() {
        this.ghostJoins.length = 0;
    }

    public addLocalMinPoly(edge1: TEdge, edge2: TEdge, point: PointI32): number {
        let result: number = -1;
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
        this.outRecManager.joinCommonEdge(join.outHash1, join.outHash2, isReverseSolution);
    }

    private joinPoints(join: Join): boolean {
        const { outHash1, outHash2, result } = this.outRecManager.joinPoints(join.outHash1, join.outHash2, join.offPoint, this.isUseFullRange);
        
        join.outHash1 = outHash1;
        join.outHash2 = outHash2;

        return result;
    }
}