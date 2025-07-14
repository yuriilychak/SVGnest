import { PointI32 } from "../geometry";
import { UNASSIGNED } from "./constants";
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
            this.joins.push(new Join(outHash1, outHash2, point2.x, point2.y));
        }  

        return condition;
    }

    static checkHorizontalCondition(edge: TEdge, neighboar: TEdge, isUseFullRange: boolean) {
        return neighboar !== null &&
        neighboar.curr.almostEqual(edge.bot) &&
        neighboar.isFilled &&
        neighboar.curr.y > neighboar.top.y &&
        TEdge.slopesEqual(edge, neighboar, isUseFullRange)
    }

    static checkSharedCondition(outHash: number, edge: TEdge, neighboar: TEdge, isUseFullRange: boolean): boolean {
        return outHash !== UNASSIGNED && JoinManager.checkHorizontalCondition(edge, neighboar, isUseFullRange) && !edge.isWindDeletaEmpty;
    }

    public addHorizontalJoin(outHash: number, edge: TEdge): void {
        let prevEdge: NullPtr<TEdge> = TEdge.at(edge.prevActiveIndex);
        let nextEdge: NullPtr<TEdge> = TEdge.at(edge.nextActive);

        const condition1 = JoinManager.checkHorizontalCondition(edge, prevEdge, this.isUseFullRange);

        this.insertJoin(condition1, outHash, prevEdge, edge.bot);

        if (!condition1) {
            const condition2 = JoinManager.checkHorizontalCondition(edge, nextEdge, this.isUseFullRange);

            this.insertJoin(condition2, outHash, nextEdge, edge.bot);
        }
    }

    public addMinJoin(outHash: number, edge: TEdge, edgePrev: TEdge, point: PointI32): void {
        const condition = edgePrev !== null &&
        edgePrev.isFilled &&
        edgePrev.topX(point.y) === edge.topX(point.y) &&
        TEdge.slopesEqual(edge, edgePrev, this.isUseFullRange) &&
        !edge.isWindDeletaEmpty;

        this.insertJoin(condition, outHash, edgePrev, point, edge.top);
    }

    public addLeftJoin(outHash: number, leftBound: TEdge) {
        const condition = leftBound.isFilled &&
        leftBound.prevActiveIndex !== UNASSIGNED &&
        leftBound.prevActive.curr.x === leftBound.bot.x &&
        leftBound.prevActive.isFilled &&
        TEdge.slopesEqual(leftBound.prevActive, leftBound, this.isUseFullRange);

        this.insertJoin(condition, outHash, leftBound.prevActive,  leftBound.bot, leftBound.top);

    }

    public addRightJoin(outHash: number, rightBound: TEdge) {
        const condition =  rightBound.isFilled &&
        rightBound.prevActive.isFilled &&
        TEdge.slopesEqual(rightBound.prevActive, rightBound, this.isUseFullRange);

        this.insertJoin(condition, outHash, rightBound.prevActive, rightBound.bot, rightBound.top);
    }

    public addScanbeamJoin(edge1: TEdge, edge2: TEdge): void {
        if (edge1.isFilled && edge2 !== null && edge2.isFilled && edge2.curr.x === edge1.curr.x) {
            const outPt1 = this.outRecManager.addOutPt(edge2, edge1.curr);
            const outPt2 = this.outRecManager.addOutPt(edge1, edge1.curr);

            this.joins.push(new Join(outPt1, outPt2, edge1.curr.x, edge1.curr.y));
            //StrictlySimple (type-3) join
        }
    }

    public addSharedJoin(outHash: number, edge1: TEdge) {
        const ePrev: TEdge = TEdge.at(edge1.prevActiveIndex);
        const eNext: TEdge = TEdge.at(edge1.nextActive);

        const condition1 = JoinManager.checkSharedCondition(outHash, edge1, ePrev, this.isUseFullRange);

        if(!this.insertJoin(condition1, outHash, ePrev,  edge1.bot, edge1.top)) {
            const condition2 = JoinManager.checkSharedCondition(outHash, edge1, eNext, this.isUseFullRange);;
            this.insertJoin(condition2, outHash, eNext,  edge1.bot, edge1.top);
        }
    }

    public addOutputJoins(outHash: number, rightBound: TEdge) {
        if (outHash !== UNASSIGNED && rightBound.isHorizontal && this.ghostJoins.length > 0 && !rightBound.isWindDeletaEmpty) {
            const joinCount: number = this.ghostJoins.length;
           
            let i: number = 0;
            let join: Join = null;

            for (i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                join = this.ghostJoins[i];

                if (this.outRecManager.horzSegmentsOverlap(join.outHash1, join.offPoint, rightBound)) {
                    this.joins.push(new Join(join.outHash1, outHash, join.offPoint.x, join.offPoint.y));
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
            const [outPtHash, x, y] = this.outRecManager.getJoinData(horzEdge);

            this.ghostJoins.push(new Join(outPtHash, UNASSIGNED, x, y));
        }
    }

    public clearGhostJoins() {
        this.ghostJoins.length = 0;
    }

    public addLocalMinPoly(edge1: TEdge, edge2: TEdge, point: PointI32): number {
        let result: number = UNASSIGNED;
        let edge: TEdge = null;
        let edgePrev: TEdge;

        if (edge2.isHorizontal || edge1.dx > edge2.dx) {
            result = this.outRecManager.addOutPt(edge1, point);
            edge2.index = edge1.index;
            edge2.side = DIRECTION.RIGHT;
            edge1.side = DIRECTION.LEFT;
            edge = edge1;
            edgePrev = edge.prevActive === edge2 ? edge2.prevActive : edge.prevActive;
        } else {
            result = this.outRecManager.addOutPt(edge2, point);
            edge1.index = edge2.index;
            edge1.side = DIRECTION.RIGHT;
            edge2.side = DIRECTION.LEFT;
            edge = edge2;
            edgePrev = edge.prevActive === edge1 ? edge1.prevActive : edge.prevActive;
        }

        this.addMinJoin(result, edge, edgePrev, point);

        return result;
    }

    public swapEdges(e1Wc: number, e2Wc: number, edge1: TEdge, edge2: TEdge, point: PointI32) {
        let e1Wc2: number = 0;
        let e2Wc2: number = 0;

        switch (this.fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                e1Wc2 = edge1.windCount2;
                e2Wc2 = edge2.windCount2;
                break;
            case POLY_FILL_TYPE.NEGATIVE:
                e1Wc2 = -edge1.windCount2;
                e2Wc2 = -edge2.windCount2;
                break;
            default:
                e1Wc2 = Math.abs(edge1.windCount2);
                e2Wc2 = Math.abs(edge2.windCount2);
                break;
        }

        
        if (edge1.polyTyp !== edge2.polyTyp) {
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
                        (edge1.polyTyp === POLY_TYPE.CLIP && Math.min(e1Wc2, e2Wc2) > 0) ||
                        (edge1.polyTyp === POLY_TYPE.SUBJECT && Math.max(e1Wc2, e2Wc2) <= 0)
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
        const [outHash1, outHash2] = this.outRecManager.joinCommonEdge(join.outHash1, join.outHash2, join.offPoint, this.isUseFullRange, isReverseSolution);
        
        join.outHash1 = outHash1;
        join.outHash2 = outHash2;
    }
}