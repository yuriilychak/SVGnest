import { PointI32 } from "../geometry";
import { UNASSIGNED } from "./constants";
import Join from "./join";
import OutRecManager from "./out-rec-manager";
import TEdge from "./t-edge";
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from "./types";

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

    private insertJoin(condition: boolean, outHash1: number, edgeIndex: number, point1: PointI32, point2: PointI32 = point1): boolean {
        if (condition) {
            const edge: TEdge = TEdge.at(edgeIndex);
            const outHash2 = this.outRecManager.addOutPt(edge, point1);
            this.joins.push(new Join(outHash1, outHash2, point2.x, point2.y));
        }  

        return condition;
    }

    public addHorizontalJoin(outHash: number, edgeIndex: number): void {
        const edge: TEdge = TEdge.at(edgeIndex);
        const condition1 = edge.checkHorizontalCondition(false, this.isUseFullRange);

        this.insertJoin(condition1, outHash, edge.prevActive, edge.bot);

        if (!condition1) {
            const condition2 = edge.checkHorizontalCondition(true, this.isUseFullRange);

            this.insertJoin(condition2, outHash, edge.nextActive, edge.bot);
        }
    }

    public addMinJoin(outHash: number, edgeIndex: number, edgePrevIndex: number, point: PointI32): void {
        const edge: TEdge = TEdge.at(edgeIndex);
        const condition = edge.checkMinJoin(edgePrevIndex, point, this.isUseFullRange);

        this.insertJoin(condition, outHash, edgePrevIndex, point, edge.top);
    }

    public addLeftJoin(outHash: number, leftBoundIndex: number) {
        const leftBound: TEdge = TEdge.at(leftBoundIndex);
        const condition = leftBound.canJoinLeft(this.isUseFullRange);

        this.insertJoin(condition, outHash, leftBound.prevActive, leftBound.bot, leftBound.top);

    }

    public addRightJoin(outHash: number, rightBoundIndex: number) {
        const rightBound: TEdge = TEdge.at(rightBoundIndex);
        const condition = rightBound.canJoinRight(this.isUseFullRange);

        this.insertJoin(condition, outHash, rightBound.prevActive, rightBound.bot, rightBound.top);
    }

    public addScanbeamJoin(edge1Index: number): void {
        const edge1: TEdge = TEdge.at(edge1Index);

        if (edge1.canAddScanbeam()) {
            const edge2: TEdge = TEdge.at(edge1.prevActive);
            const outPt1 = this.outRecManager.addOutPt(edge2, edge1.curr);
            const outPt2 = this.outRecManager.addOutPt(edge1, edge1.curr);

            this.joins.push(new Join(outPt1, outPt2, edge1.curr.x, edge1.curr.y));
            //StrictlySimple (type-3) join
        }
    }

    public addSharedJoin(outHash: number, edgeIndex: number) {
        const edge: TEdge = TEdge.at(edgeIndex);
        const condition1 = edge.checkSharedCondition(outHash, false, this.isUseFullRange);

        if(!this.insertJoin(condition1, outHash, edge.prevActive,  edge.bot, edge.top)) {
            const condition2 = edge.checkSharedCondition(outHash, true, this.isUseFullRange);;
            this.insertJoin(condition2, outHash, edge.nextActive,  edge.bot, edge.top);
        }
    }

    public addOutputJoins(outHash: number, rightBoundIndex: number) {
        const edge: TEdge = TEdge.at(rightBoundIndex);
        if (outHash !== UNASSIGNED && edge.isHorizontal && this.ghostJoins.length > 0 && !edge.isWindDeletaEmpty) {
            const joinCount: number = this.ghostJoins.length;

            for (let i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                const join = this.ghostJoins[i];

                if (this.outRecManager.horzSegmentsOverlap(join.outHash1, join.offPoint, edge)) {
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

    public prepareHorzJoins(horzEdgeIndex: number, isTopOfScanbeam: boolean) {
        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        if (isTopOfScanbeam) {
            //get the last Op for this horizontal edge
            //the point may be anywhere along the horizontal ...
            const [outPtHash, x, y] = this.outRecManager.getJoinData(horzEdgeIndex);

            this.ghostJoins.push(new Join(outPtHash, UNASSIGNED, x, y));
        }
    }

    public clearGhostJoins() {
        this.ghostJoins.length = 0;
    }

    public addLocalMinPoly(edge1Index: number, edge2Index: number, point: PointI32): number {
        const edge1: TEdge = TEdge.at(edge1Index);
        const edge2: TEdge = TEdge.at(edge2Index);
        let firstEdge: TEdge = edge2;
        let secondEdge: TEdge = edge1;
        let result: number = UNASSIGNED;

        if (edge2.isHorizontal || edge1.dx > edge2.dx) {
            firstEdge = edge1;
            secondEdge = edge2;
        }

        result = this.outRecManager.addOutPt(firstEdge, point);
        secondEdge.index = firstEdge.index;
        secondEdge.side = DIRECTION.RIGHT;
        firstEdge.side = DIRECTION.LEFT;

        const currIndex = firstEdge.current;
        const prevIndex = firstEdge.prevActive === secondEdge.current ? secondEdge.prevActive : firstEdge.prevActive;

        this.addMinJoin(result, currIndex, prevIndex, point);

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
            this.addLocalMinPoly(edge1.current, edge2.current, point);
        } else if (e1Wc === 1 && e2Wc === 1) {
            switch (this.clipType) {
                case CLIP_TYPE.UNION:
                    if (e1Wc2 <= 0 && e2Wc2 <= 0) {
                        this.addLocalMinPoly(edge1.current, edge2.current, point);
                    }
                    break;
                case CLIP_TYPE.DIFFERENCE:
                    if (
                        (edge1.polyTyp === POLY_TYPE.CLIP && Math.min(e1Wc2, e2Wc2) > 0) ||
                        (edge1.polyTyp === POLY_TYPE.SUBJECT && Math.max(e1Wc2, e2Wc2) <= 0)
                    ) {
                        this.addLocalMinPoly(edge1.current, edge2.current, point);
                    }
                    break;
            }
        } else {
            TEdge.swapSides(edge1.current, edge2.current);
        }
    }

    private joinCommonEdge(join: Join, isReverseSolution: boolean): void {
        const [outHash1, outHash2] = this.outRecManager.joinCommonEdge(join.outHash1, join.outHash2, join.offPoint, this.isUseFullRange, isReverseSolution);
        
        join.outHash1 = outHash1;
        join.outHash2 = outHash2;
    }
}