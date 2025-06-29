import { PointI32 } from "../geometry";
import Join from "./join";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./t-edge";
import { DIRECTION, NullPtr } from "./types";

export default class JoinManager {
    private joins: Join[] = [];
    private ghostJoins: Join[] = [];

    private insertJoin(outPt1: OutPt, edge: TEdge, polyOuts: OutRec[], point1: PointI32, point2: PointI32 = point1) {
        const outPt2: NullPtr<OutPt> = OutRec.addOutPt(polyOuts, edge, point1);
        this.joins.push(new Join(outPt1, outPt2, point2));
    }

    public addHorizontalJoin(op: OutPt, horzEdge: TEdge, polyOuts: OutRec[], isUseFullRange: boolean): void {
        let prevEdge: NullPtr<TEdge> = horzEdge.PrevInAEL;
        let nextEdge: NullPtr<TEdge> = horzEdge.NextInAEL;

        if (
            prevEdge !== null &&
            prevEdge.Curr.almostEqual(horzEdge.Bot) &&
            prevEdge.isFilled &&
            prevEdge.Curr.y > prevEdge.Top.y &&
            TEdge.slopesEqual(horzEdge, prevEdge, isUseFullRange)
        ) {
            this.insertJoin(op, prevEdge, polyOuts, horzEdge.Bot);
        } else if (
            nextEdge !== null &&
            nextEdge.Curr.almostEqual(horzEdge.Bot) &&
            nextEdge.isFilled &&
            nextEdge.Curr.y > nextEdge.Top.y &&
            TEdge.slopesEqual(horzEdge, nextEdge, isUseFullRange)
        ) {
            this.insertJoin(op, nextEdge, polyOuts, horzEdge.Bot);
        }
    }

    public addMinJoin(op: OutPt, edge: TEdge, edgePrev: TEdge, point: PointI32, polyOuts: OutRec[], isUseFullRange: boolean): void {
        if (
            edgePrev !== null &&
            edgePrev.isFilled &&
            edgePrev.topX(point.y) === edge.topX(point.y) &&
            TEdge.slopesEqual(edge, edgePrev, isUseFullRange) &&
            !edge.isWindDeletaEmpty
        ) {
            this.insertJoin(op, edgePrev, polyOuts, point, edge.Top);
        }
    }

    public addLeftJoin(outPt: OutPt, leftBound: TEdge, polyOuts: OutRec[], isUseFullRange: boolean) {
        if (
            leftBound.isFilled &&
            leftBound.PrevInAEL !== null &&
            leftBound.PrevInAEL.Curr.x === leftBound.Bot.x &&
            leftBound.PrevInAEL.isFilled &&
            TEdge.slopesEqual(leftBound.PrevInAEL, leftBound, isUseFullRange)
        ) {
            this.insertJoin(outPt, leftBound.PrevInAEL, polyOuts,  leftBound.Bot, leftBound.Top);
        }
    }

    public addRightJoin(outPt: OutPt, rightBound: TEdge, polyOuts: OutRec[], isUseFullRange: boolean) {
        if (
            rightBound.isFilled &&
            rightBound.PrevInAEL.isFilled &&
            TEdge.slopesEqual(rightBound.PrevInAEL, rightBound, isUseFullRange)
        ) {
            this.insertJoin(outPt, rightBound.PrevInAEL, polyOuts,  rightBound.Bot, rightBound.Top);
        }
    }

    public addScanbeamJoin(edge1: TEdge, edge2: TEdge, polyOuts: OutRec[]): void {
        if (edge1.isFilled && edge2 !== null && edge2.isFilled && edge2.Curr.x === edge1.Curr.x) {
            const outPt1 = OutRec.addOutPt(polyOuts, edge2, edge1.Curr);
            const outPt2 = OutRec.addOutPt(polyOuts, edge1, edge1.Curr);

            this.joins.push(new Join(outPt1, outPt2, edge1.Curr));
            //StrictlySimple (type-3) join
        }
    }

    public addSharedJoin(outPt1: OutPt, edge1: TEdge, polyOuts: OutRec[], isUseFullRange: boolean) {
        const ePrev: TEdge = edge1.PrevInAEL;
        const eNext: TEdge = edge1.NextInAEL;

        if (
            outPt1 !== null &&
            ePrev !== null &&
            ePrev.Curr.almostEqual(edge1.Bot) &&
            ePrev.isFilled &&
            ePrev.Curr.y > ePrev.Top.y &&
            TEdge.slopesEqual(edge1, ePrev, isUseFullRange) &&
            !edge1.isWindDeletaEmpty
        ) {
            this.insertJoin(outPt1, ePrev, polyOuts,  edge1.Bot, edge1.Top);
        } else if (
            outPt1 !== null &&
            eNext !== null &&
            eNext.Curr.almostEqual(edge1.Bot) &&
            eNext.isFilled &&
            eNext.Curr.y > eNext.Top.y &&
            TEdge.slopesEqual(edge1, eNext, isUseFullRange) &&
            !edge1.isWindDeletaEmpty
        ) {
            this.insertJoin(outPt1, eNext, polyOuts,  edge1.Bot, edge1.Top);
        }
    }

    public addOutputJoins(outPt: OutPt, rightBound: TEdge) {
        if (outPt !== null && rightBound.isHorizontal && this.ghostJoins.length > 0 && !rightBound.isWindDeletaEmpty) {
            const joinCount: number = this.ghostJoins.length;
            let i: number = 0;
            let join: Join = null;

            for (i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                join = this.ghostJoins[i];

                if (PointI32.horzSegmentsOverlap(join.OutPt1.point, join.OffPt, rightBound.Bot, rightBound.Top)) {
                    this.joins.push(new Join(join.OutPt1, outPt, join.OffPt));
                }
            }
        }
    }

    public joinCommonEdges(polyOuts: OutRec[], isUseFullRange: boolean, reverseSolution: boolean) {
        let i: number = 0;
        const joinCount: number = this.joins.length;

        for (i = 0; i < joinCount; ++i) {
            this.joins[i].joinCommonEdges(polyOuts, isUseFullRange, reverseSolution);
        }
    }

    public reset() {
        this.joins.length = 0;
        this.ghostJoins.length = 0;
    }

    public prepareHorzJoins(horzEdge: TEdge, isTopOfScanbeam: boolean, polyOuts: OutRec[]) {
        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        if (isTopOfScanbeam) {
            //get the last Op for this horizontal edge
            //the point may be anywhere along the horizontal ...
            let outPt: NullPtr<OutPt> = polyOuts[horzEdge.index].Pts;

            if (horzEdge.Side === DIRECTION.RIGHT) {
                outPt = outPt.prev;
            }

            const offPoint: PointI32 = outPt.point.almostEqual(horzEdge.Top) ? horzEdge.Bot : horzEdge.Top;

            this.ghostJoins.push(new Join(outPt, null, offPoint));
        }
    }

    public clearGhostJoins() {
        this.ghostJoins.length = 0;
    }
}