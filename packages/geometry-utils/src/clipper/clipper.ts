import Point from '../point';
import ClipperBase from './clipper-base';
import { HorzSegmentsOverlap, op_Equality, showError, SlopesEqualPoints } from './helpers';
import IntersectNode from './intersect-node';
import Join from './join';
import OutPt from './out-pt';
import OutRec from './out-rec';
import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from './types';

export default class Clipper extends ClipperBase {
    private m_ClipType: ClipType = ClipType.ctIntersection;
    private m_ClipFillType: PolyFillType = PolyFillType.pftEvenOdd;
    private m_SubjFillType: PolyFillType = PolyFillType.pftEvenOdd;
    private m_Scanbeam: Scanbeam | null = null;
    private m_ActiveEdges: TEdge = null;
    private m_SortedEdges: TEdge = null;
    private m_IntersectList: IntersectNode[] = [];
    private m_ExecuteLocked: boolean = false;
    private m_PolyOuts: OutRec[] = [];
    private m_Joins: Join[] = [];
    private m_GhostJoins: Join[] = [];
    public ReverseSolution: boolean = false;
    public StrictlySimple: boolean = false;

    public Execute(clipType: ClipType, solution: Point[][], subjFillType: PolyFillType, clipFillType: PolyFillType): boolean {
        if (this.m_ExecuteLocked) {
            return false;
        }

        solution.length = 0;

        this.m_ExecuteLocked = true;
        this.m_SubjFillType = subjFillType;
        this.m_ClipFillType = clipFillType;
        this.m_ClipType = clipType;

        let succeeded: boolean = false;

        try {
            succeeded = this.ExecuteInternal();
            //build the return polygons ...
            if (succeeded) {
                this.BuildResult(solution);
            }
        } finally {
            this.DisposeAllPolyPts();
            this.m_ExecuteLocked = false;
        }

        return succeeded;
    }

    private ExecuteInternal(): boolean {
        try {
            this.Reset();

            if (this.currentLM === null) {
                return false;
            }

            let i: number = 0;
            let outRec: OutRec = null;
            let outRecCount: number = 0;
            let botY: number = this.PopScanbeam();
            let topY: number = 0;

            do {
                this.InsertLocalMinimaIntoAEL(botY);
                this.m_GhostJoins = [];
                this.ProcessHorizontals(false);

                if (this.m_Scanbeam === null) {
                    break;
                }

                topY = this.PopScanbeam();
                //console.log("botY:" + botY + ", topY:" + topY);
                if (!this.ProcessIntersections(botY, topY)) {
                    return false;
                }

                this.ProcessEdgesAtTopOfScanbeam(topY);

                botY = topY;
            } while (this.m_Scanbeam !== null || this.currentLM !== null);
            //fix orientations ...
            outRecCount = this.m_PolyOuts.length;

            for (i = 0; i < outRecCount; ++i) {
                outRec = this.m_PolyOuts[i];

                if (outRec.isEmpty) {
                    continue;
                }

                if ((outRec.IsHole !== this.ReverseSolution) === outRec.area > 0) {
                    outRec.reversePts();
                }
            }

            this.JoinCommonEdges();

            outRecCount = this.m_PolyOuts.length;

            for (i = 0; i < outRecCount; ++i) {
                outRec = this.m_PolyOuts[i];

                if (!outRec.isEmpty) {
                    outRec.fixupOutPolygon(false, this.isUseFullRange);
                }
            }

            if (this.StrictlySimple) {
                this.DoSimplePolygons();
            }

            return true;
        } finally {
            this.m_Joins = [];
            this.m_GhostJoins = [];
        }
    }

    private IsMaxima(e: TEdge, Y: number) {
        return e !== null && e.Top.y === Y && e.NextInLML === null;
    }

    private ProcessEdgesAtTopOfScanbeam(topY: number) {
        let e: TEdge = this.m_ActiveEdges;

        while (e !== null) {
            //1. process maxima, treating them as if they're 'bent' horizontal edges,
            //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
            let IsMaximaEdge: boolean = this.IsMaxima(e, topY);
            if (IsMaximaEdge) {
                const eMaxPair: TEdge | null = this.GetMaximaPair(e);
                IsMaximaEdge = eMaxPair === null || !eMaxPair.isHorizontal;
            }
            if (IsMaximaEdge) {
                const ePrev: TEdge | null = e.PrevInAEL;
                this.DoMaxima(e);

                e = ePrev === null ? this.m_ActiveEdges : ePrev.NextInAEL;
            } else {
                //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
                if (e.getIntermediate(topY) && e.NextInLML.isHorizontal) {
                    e = this.UpdateEdgeIntoAEL(e);

                    if (e.OutIdx >= 0) {
                        this.AddOutPt(e, e.Bot);
                    }

                    this.AddEdgeToSEL(e);
                } else {
                    e.Curr.x = e.topX(topY);
                    e.Curr.y = topY;
                }
                if (this.StrictlySimple) {
                    const ePrev: TEdge | null = e.PrevInAEL;
                    if (
                        e.OutIdx >= 0 &&
                        e.WindDelta !== 0 &&
                        ePrev !== null &&
                        ePrev.OutIdx >= 0 &&
                        ePrev.Curr.x === e.Curr.x &&
                        ePrev.WindDelta !== 0
                    ) {
                        const op: OutPt = this.AddOutPt(ePrev, e.Curr);
                        const op2: OutPt = this.AddOutPt(e, e.Curr);
                        this.AddJoin(op, op2, e.Curr);
                        //StrictlySimple (type-3) join
                    }
                }
                e = e.NextInAEL;
            }
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.ProcessHorizontals(true);
        //4. Promote intermediate vertices ...
        e = this.m_ActiveEdges;
        while (e !== null) {
            if (e.getIntermediate(topY)) {
                let op: OutPt = null;
                if (e.OutIdx >= 0) op = this.AddOutPt(e, e.Top);
                e = this.UpdateEdgeIntoAEL(e);
                //if output polygons share an edge, they'll need joining later ...
                const ePrev: TEdge = e.PrevInAEL;
                const eNext: TEdge = e.NextInAEL;

                if (
                    ePrev !== null &&
                    ePrev.Curr.x === e.Bot.x &&
                    ePrev.Curr.y === e.Bot.y &&
                    op !== null &&
                    ePrev.OutIdx >= 0 &&
                    ePrev.Curr.y > ePrev.Top.y &&
                    TEdge.slopesEqual(e, ePrev, this.isUseFullRange) &&
                    e.WindDelta !== 0 &&
                    ePrev.WindDelta !== 0
                ) {
                    const op2: OutPt = this.AddOutPt(ePrev, e.Bot);
                    this.AddJoin(op, op2, e.Top);
                } else if (
                    eNext !== null &&
                    eNext.Curr.x === e.Bot.x &&
                    eNext.Curr.y === e.Bot.y &&
                    op !== null &&
                    eNext.OutIdx >= 0 &&
                    eNext.Curr.y > eNext.Top.y &&
                    TEdge.slopesEqual(e, eNext, this.isUseFullRange) &&
                    e.WindDelta !== 0 &&
                    eNext.WindDelta !== 0
                ) {
                    const op2: OutPt = this.AddOutPt(eNext, e.Bot);
                    this.AddJoin(op, op2, e.Top);
                }
            }
            e = e.NextInAEL;
        }
    }

    private DoMaxima(e: TEdge) {
        const eMaxPair: TEdge | null = this.GetMaximaPair(e);
        if (eMaxPair === null) {
            if (e.OutIdx >= 0) this.AddOutPt(e, e.Top);
            this.m_ActiveEdges = e.deleteFromAEL(this.m_ActiveEdges);
            return;
        }

        let eNext: TEdge | null = e.NextInAEL;
        const use_lines = true;

        while (eNext !== null && eNext !== eMaxPair) {
            this.IntersectEdges(e, eNext, e.Top, true);
            this.SwapPositionsInAEL(e, eNext);
            eNext = e.NextInAEL;
        }
        if (e.OutIdx === -1 && eMaxPair.OutIdx === -1) {
            this.m_ActiveEdges = e.deleteFromAEL(this.m_ActiveEdges);
            this.m_ActiveEdges = eMaxPair.deleteFromAEL(this.m_ActiveEdges);
        } else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0) {
            this.IntersectEdges(e, eMaxPair, e.Top, false);
        } else if (use_lines && e.WindDelta === 0) {
            if (e.OutIdx >= 0) {
                this.AddOutPt(e, e.Top);
                e.OutIdx = -1;
            }
            this.m_ActiveEdges = e.deleteFromAEL(this.m_ActiveEdges);
            if (eMaxPair.OutIdx >= 0) {
                this.AddOutPt(eMaxPair, e.Top);
                eMaxPair.OutIdx = -1;
            }
            this.m_ActiveEdges = eMaxPair.deleteFromAEL(this.m_ActiveEdges);
        } else showError('DoMaxima error');
    }

    private GetOutRec(idx: number): OutRec {
        let result: OutRec = this.m_PolyOuts[idx];

        while (result !== this.m_PolyOuts[result.Idx]) {
            result = this.m_PolyOuts[result.Idx];
        }
        return result;
    }

    private DupOutPt(outPt: OutPt, InsertAfter: boolean) {
        const result: OutPt = new OutPt();
        //result.Pt = outPt.Pt;
        result.Pt.x = outPt.Pt.x;
        result.Pt.y = outPt.Pt.y;
        result.Idx = outPt.Idx;
        if (InsertAfter) {
            result.Next = outPt.Next;
            result.Prev = outPt;
            outPt.Next.Prev = result;
            outPt.Next = result;
        } else {
            result.Prev = outPt.Prev;
            result.Next = outPt;
            outPt.Prev.Next = result;
            outPt.Prev = result;
        }
        return result;
    }

    private JoinPoints(j: Join, outRec1: OutRec, outRec2: OutRec) {
        let op1: OutPt = j.OutPt1;
        let op2: OutPt = j.OutPt2;
        let op1b: OutPt = new OutPt();
        let op2b: OutPt = new OutPt();
        //There are 3 kinds of joins for output polygons ...
        //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
        //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
        //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
        //location at the Bottom of the overlapping segment (& Join.OffPt is above).
        //3. StrictlySimple joins where edges touch but are not collinear and where
        //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
        const isHorizontal: boolean = j.OutPt1.Pt.y === j.OffPt.y;

        if (isHorizontal && op_Equality(j.OffPt, j.OutPt1.Pt) && op_Equality(j.OffPt, j.OutPt2.Pt)) {
            //Strictly Simple join ...
            op1b = j.OutPt1.Next;

            while (op1b !== op1 && op_Equality(op1b.Pt, j.OffPt)) {
                op1b = op1b.Next;
            }

            const reverse1: boolean = op1b.Pt.y > j.OffPt.y;
            op2b = j.OutPt2.Next;

            while (op2b !== op2 && op_Equality(op2b.Pt, j.OffPt)) {
                op2b = op2b.Next;
            }

            const reverse2: boolean = op2b.Pt.y > j.OffPt.y;

            if (reverse1 === reverse2) {
                return false;
            }

            if (reverse1) {
                op1b = this.DupOutPt(op1, false);
                op2b = this.DupOutPt(op2, true);
                op1.Prev = op2;
                op2.Next = op1;
                op1b.Next = op2b;
                op2b.Prev = op1b;
                j.OutPt1 = op1;
                j.OutPt2 = op1b;
            } else {
                op1b = this.DupOutPt(op1, true);
                op2b = this.DupOutPt(op2, false);
                op1.Next = op2;
                op2.Prev = op1;
                op1b.Prev = op2b;
                op2b.Next = op1b;
                j.OutPt1 = op1;
                j.OutPt2 = op1b;
            }

            return true;
        } else if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            op1b = op1;
            while (op1.Prev.Pt.y === op1.Pt.y && op1.Prev !== op1b && op1.Prev !== op2) op1 = op1.Prev;
            while (op1b.Next.Pt.y === op1b.Pt.y && op1b.Next !== op1 && op1b.Next !== op2) op1b = op1b.Next;
            if (op1b.Next === op1 || op1b.Next === op2) return false;
            //a flat 'polygon'
            op2b = op2;
            while (op2.Prev.Pt.y === op2.Pt.y && op2.Prev !== op2b && op2.Prev !== op1b) op2 = op2.Prev;
            while (op2b.Next.Pt.y === op2b.Pt.y && op2b.Next !== op2 && op2b.Next !== op1) op2b = op2b.Next;
            if (op2b.Next === op2 || op2b.Next === op1) return false;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value: Point = Point.zero();

            if (!this.GetOverlap(op1.Pt.x, op1b.Pt.x, op2.Pt.x, op2b.Pt.x, value)) {
                return false;
            }

            const left: number = value.x;
            const right: number = value.y;

            //DiscardLeftSide: when overlapping edges are joined, a spike will created
            //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
            //on the discard Side as either may still be needed for other joins ...
            const Pt: Point = Point.zero();
            let DiscardLeftSide: boolean = false;
            if (op1.Pt.x >= left && op1.Pt.x <= right) {
                //Pt = op1.Pt;
                Pt.x = op1.Pt.x;
                Pt.y = op1.Pt.y;
                DiscardLeftSide = op1.Pt.x > op1b.Pt.x;
            } else if (op2.Pt.x >= left && op2.Pt.x <= right) {
                //Pt = op2.Pt;
                Pt.x = op2.Pt.x;
                Pt.y = op2.Pt.y;
                DiscardLeftSide = op2.Pt.x > op2b.Pt.x;
            } else if (op1b.Pt.x >= left && op1b.Pt.x <= right) {
                //Pt = op1b.Pt;
                Pt.x = op1b.Pt.x;
                Pt.y = op1b.Pt.y;
                DiscardLeftSide = op1b.Pt.x > op1.Pt.x;
            } else {
                //Pt = op2b.Pt;
                Pt.x = op2b.Pt.x;
                Pt.y = op2b.Pt.y;
                DiscardLeftSide = op2b.Pt.x > op2.Pt.x;
            }
            j.OutPt1 = op1;
            j.OutPt2 = op2;
            return this.JoinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
        } else {
            //nb: For non-horizontal joins ...
            //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
            //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
            //make sure the polygons are correctly oriented ...
            op1b = op1.Next;

            while (op_Equality(op1b.Pt, op1.Pt) && op1b !== op1) {
                op1b = op1b.Next;
            }

            const reverse1: boolean = op1b.Pt.y > op1.Pt.y || !SlopesEqualPoints(op1.Pt, op1b.Pt, j.OffPt, this.isUseFullRange);

            if (reverse1) {
                op1b = op1.Prev;

                while (op_Equality(op1b.Pt, op1.Pt) && op1b !== op1) {
                    op1b = op1b.Prev;
                }

                if (op1b.Pt.y > op1.Pt.y || !SlopesEqualPoints(op1.Pt, op1b.Pt, j.OffPt, this.isUseFullRange)) {
                    return false;
                }
            }

            op2b = op2.Next;

            while (op_Equality(op2b.Pt, op2.Pt) && op2b !== op2) {
                op2b = op2b.Next;
            }

            const reverse2: boolean = op2b.Pt.y > op2.Pt.y || !SlopesEqualPoints(op2.Pt, op2b.Pt, j.OffPt, this.isUseFullRange);

            if (reverse2) {
                op2b = op2.Prev;

                while (op_Equality(op2b.Pt, op2.Pt) && op2b !== op2) {
                    op2b = op2b.Prev;
                }

                if (op2b.Pt.y > op2.Pt.y || !SlopesEqualPoints(op2.Pt, op2b.Pt, j.OffPt, this.isUseFullRange)) {
                    return false;
                }
            }

            if (op1b === op1 || op2b === op2 || op1b === op2b || (outRec1 === outRec2 && reverse1 === reverse2)) {
                return false;
            }

            if (reverse1) {
                op1b = this.DupOutPt(op1, false);
                op2b = this.DupOutPt(op2, true);
                op1.Prev = op2;
                op2.Next = op1;
                op1b.Next = op2b;
                op2b.Prev = op1b;
                j.OutPt1 = op1;
                j.OutPt2 = op1b;
            } else {
                op1b = this.DupOutPt(op1, true);
                op2b = this.DupOutPt(op2, false);
                op1.Next = op2;
                op2.Prev = op1;
                op1b.Prev = op2b;
                op2b.Next = op1b;
                j.OutPt1 = op1;
                j.OutPt2 = op1b;
            }

            return true;
        }
    }

    private GetOverlap(a1: number, a2: number, b1: number, b2: number, value: Point) {
        if (a1 < a2) {
            if (b1 < b2) {
                value.x = Math.max(a1, b1);
                value.y = Math.min(a2, b2);
            } else {
                value.x = Math.max(a1, b2);
                value.y = Math.min(a2, b1);
            }
        } else {
            if (b1 < b2) {
                value.x = Math.max(a2, b1);
                value.y = Math.min(a1, b2);
            } else {
                value.x = Math.max(a2, b2);
                value.y = Math.min(a1, b1);
            }
        }
        return value.x < value.y;
    }

    private JoinHorz(op1: OutPt, op1b: OutPt, op2: OutPt, op2b: OutPt, Pt: Point, DiscardLeft: boolean) {
        const direction1: Direction = op1.Pt.x > op1b.Pt.x ? Direction.dRightToLeft : Direction.dLeftToRight;
        const direction2: Direction = op2.Pt.x > op2b.Pt.x ? Direction.dRightToLeft : Direction.dLeftToRight;

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        if (direction1 === Direction.dLeftToRight) {
            while (op1.Next.Pt.x <= Pt.x && op1.Next.Pt.x >= op1.Pt.x && op1.Next.Pt.y === Pt.y) {
                op1 = op1.Next;
            }

            if (DiscardLeft && op1.Pt.x !== Pt.x) {
                op1 = op1.Next;
            }

            op1b = this.DupOutPt(op1, !DiscardLeft);

            if (!op_Equality(op1b.Pt, Pt)) {
                op1 = op1b;
                //op1.Pt = Pt;
                op1.Pt.x = Pt.x;
                op1.Pt.y = Pt.y;
                op1b = this.DupOutPt(op1, !DiscardLeft);
            }
        } else {
            while (op1.Next.Pt.x >= Pt.x && op1.Next.Pt.x <= op1.Pt.x && op1.Next.Pt.y === Pt.y) {
                op1 = op1.Next;
            }

            if (!DiscardLeft && op1.Pt.x !== Pt.x) {
                op1 = op1.Next;
            }

            op1b = this.DupOutPt(op1, DiscardLeft);

            if (!op_Equality(op1b.Pt, Pt)) {
                op1 = op1b;
                //op1.Pt = Pt;
                op1.Pt.x = Pt.x;
                op1.Pt.y = Pt.y;
                op1b = this.DupOutPt(op1, DiscardLeft);
            }
        }
        if (direction2 === Direction.dLeftToRight) {
            while (op2.Next.Pt.x <= Pt.x && op2.Next.Pt.x >= op2.Pt.x && op2.Next.Pt.y === Pt.y) {
                op2 = op2.Next;
            }

            if (DiscardLeft && op2.Pt.x !== Pt.x) {
                op2 = op2.Next;
            }

            op2b = this.DupOutPt(op2, !DiscardLeft);

            if (!op_Equality(op2b.Pt, Pt)) {
                op2 = op2b;
                //op2.Pt = Pt;
                op2.Pt.x = Pt.x;
                op2.Pt.y = Pt.y;
                op2b = this.DupOutPt(op2, !DiscardLeft);
            }
        } else {
            while (op2.Next.Pt.x >= Pt.x && op2.Next.Pt.x <= op2.Pt.x && op2.Next.Pt.y === Pt.y) {
                op2 = op2.Next;
            }

            if (!DiscardLeft && op2.Pt.x !== Pt.x) {
                op2 = op2.Next;
            }

            op2b = this.DupOutPt(op2, DiscardLeft);
            if (!op_Equality(op2b.Pt, Pt)) {
                op2 = op2b;
                //op2.Pt = Pt;
                op2.Pt.x = Pt.x;
                op2.Pt.y = Pt.y;
                op2b = this.DupOutPt(op2, DiscardLeft);
            }
        }
        if ((direction1 === Direction.dLeftToRight) === DiscardLeft) {
            op1.Prev = op2;
            op2.Next = op1;
            op1b.Next = op2b;
            op2b.Prev = op1b;
        } else {
            op1.Next = op2;
            op2.Prev = op1;
            op1b.Prev = op2b;
            op2b.Next = op1b;
        }

        return true;
    }

    private UpdateOutPtIdxs(outrec: OutRec): void {
        let op: OutPt | null = outrec.Pts;

        do {
            op.Idx = outrec.Idx;
            op = op.Prev;
        } while (op !== outrec.Pts);
    }

    private JoinCommonEdges() {
        const joinCount: number = this.m_Joins.length;
        let i: number = 0;
        let join: Join = null;
        let outRec1: OutRec | null = null;
        let outRec2: OutRec | null = null;
        let holeStateRec: OutRec | null = null;

        for (i = 0; i < joinCount; ++i) {
            join = this.m_Joins[i];
            outRec1 = this.GetOutRec(join.OutPt1.Idx);
            outRec2 = this.GetOutRec(join.OutPt2.Idx);

            if (outRec1.Pts === null || outRec2.Pts === null) {
                continue;
            }
            //get the polygon fragment with the correct hole state (FirstLeft)
            //before calling JoinPoints() ...
            if (outRec1 === outRec2) {
                holeStateRec = outRec1;
            } else if (OutRec.param1RightOfParam2(outRec1, outRec2)) {
                holeStateRec = outRec2;
            } else if (OutRec.param1RightOfParam2(outRec2, outRec1)) {
                holeStateRec = outRec1;
            } else {
                holeStateRec = this.GetLowermostRec(outRec1, outRec2);
            }

            if (!this.JoinPoints(join, outRec1, outRec2)) {
                continue;
            }

            if (outRec1 === outRec2) {
                //instead of joining two polygons, we've just created a new one by
                //splitting one polygon into two.
                outRec1.Pts = join.OutPt1;
                outRec1.BottomPt = null;
                outRec2 = OutRec.create(this.m_PolyOuts);
                outRec2.Pts = join.OutPt2;
                //update all OutRec2.Pts Idx's ...
                this.UpdateOutPtIdxs(outRec2);

                if (outRec1.containsPoly(outRec2)) {
                    //outRec2 is contained by outRec1 ...
                    outRec2.IsHole = !outRec1.IsHole;
                    outRec2.FirstLeft = outRec1;

                    if ((outRec2.IsHole !== this.ReverseSolution) === outRec2.area > 0) {
                        outRec2.Pts.reverse();
                    }
                } else if (outRec2.containsPoly(outRec1)) {
                    //outRec1 is contained by outRec2 ...
                    outRec2.IsHole = outRec1.IsHole;
                    outRec1.IsHole = !outRec2.IsHole;
                    outRec2.FirstLeft = outRec1.FirstLeft;
                    outRec1.FirstLeft = outRec2;

                    if ((outRec1.IsHole !== this.ReverseSolution) === outRec1.area > 0) {
                        outRec1.Pts.reverse();
                    }
                } else {
                    //the 2 polygons are completely separate ...
                    outRec2.IsHole = outRec1.IsHole;
                    outRec2.FirstLeft = outRec1.FirstLeft;
                }
            } else {
                //joined 2 polygons together ...
                outRec2.Pts = null;
                outRec2.BottomPt = null;
                outRec2.Idx = outRec1.Idx;
                outRec1.IsHole = holeStateRec.IsHole;

                if (holeStateRec === outRec2) {
                    outRec1.FirstLeft = outRec2.FirstLeft;
                }

                outRec2.FirstLeft = outRec1;
            }
        }
    }

    private InsertLocalMinimaIntoAEL(botY: number) {
        let lb: TEdge = null;
        let rb: TEdge = null;
        let Op1: OutPt = null;

        while (this.currentLM !== null && this.currentLM.Y === botY) {
            lb = this.currentLM.LeftBound;
            rb = this.currentLM.RightBound;
            Op1 = null;

            this.PopLocalMinima();

            if (lb === null) {
                this.InsertEdgeIntoAEL(rb, null);
                this.SetWindingCount(rb);

                if (this.IsContributing(rb)) {
                    Op1 = this.AddOutPt(rb, rb.Bot);
                }
            } else if (rb === null) {
                this.InsertEdgeIntoAEL(lb, null);
                this.SetWindingCount(lb);

                if (this.IsContributing(lb)) {
                    Op1 = this.AddOutPt(lb, lb.Bot);
                }

                this.m_Scanbeam = Scanbeam.insert(lb.Top.y, this.m_Scanbeam);
            } else {
                this.InsertEdgeIntoAEL(lb, null);
                this.InsertEdgeIntoAEL(rb, lb);
                this.SetWindingCount(lb);
                rb.WindCnt = lb.WindCnt;
                rb.WindCnt2 = lb.WindCnt2;

                if (this.IsContributing(lb)) {
                    Op1 = this.AddLocalMinPoly(lb, rb, lb.Bot);
                }

                this.m_Scanbeam = Scanbeam.insert(lb.Top.y, this.m_Scanbeam);
            }
            if (rb !== null) {
                if (rb.isHorizontal) {
                    this.AddEdgeToSEL(rb);
                } else {
                    this.m_Scanbeam = Scanbeam.insert(rb.Top.y, this.m_Scanbeam);
                }
            }

            if (lb === null || rb === null) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            if (Op1 !== null && rb.isHorizontal && this.m_GhostJoins.length > 0 && rb.WindDelta !== 0) {
                const joinCount: number = this.m_GhostJoins.length;
                let i: number = 0;
                let j: Join = null;

                for (i = 0; i < joinCount; ++i) {
                    //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                    //the 'ghost' join to a real join ready for later ...
                    j = this.m_GhostJoins[i];

                    if (HorzSegmentsOverlap(j.OutPt1.Pt, j.OffPt, rb.Bot, rb.Top)) {
                        this.AddJoin(j.OutPt1, Op1, j.OffPt);
                    }
                }
            }
            if (
                lb.OutIdx >= 0 &&
                lb.PrevInAEL !== null &&
                lb.PrevInAEL.Curr.x === lb.Bot.x &&
                lb.PrevInAEL.OutIdx >= 0 &&
                TEdge.slopesEqual(lb.PrevInAEL, lb, this.isUseFullRange) &&
                lb.WindDelta !== 0 &&
                lb.PrevInAEL.WindDelta !== 0
            ) {
                const Op2: OutPt | null = this.AddOutPt(lb.PrevInAEL, lb.Bot);
                this.AddJoin(Op1, Op2, lb.Top);
            }
            if (lb.NextInAEL !== rb) {
                if (
                    rb.OutIdx >= 0 &&
                    rb.PrevInAEL.OutIdx >= 0 &&
                    TEdge.slopesEqual(rb.PrevInAEL, rb, this.isUseFullRange) &&
                    rb.WindDelta !== 0 &&
                    rb.PrevInAEL.WindDelta !== 0
                ) {
                    const Op2: OutPt | null = this.AddOutPt(rb.PrevInAEL, rb.Bot);
                    this.AddJoin(Op1, Op2, rb.Top);
                }
                let e: TEdge | null = lb.NextInAEL;
                if (e !== null)
                    while (e !== rb) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.IntersectEdges(rb, e, lb.Curr, false);
                        //order important here
                        e = e.NextInAEL;
                    }
            }
        }
    }

    private AddEdgeToSEL(edge: TEdge): void {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        if (this.m_SortedEdges === null) {
            this.m_SortedEdges = edge;
            edge.PrevInSEL = null;
            edge.NextInSEL = null;
        } else {
            edge.NextInSEL = this.m_SortedEdges;
            edge.PrevInSEL = null;
            this.m_SortedEdges.PrevInSEL = edge;
            this.m_SortedEdges = edge;
        }
    }

    private InsertEdgeIntoAEL(edge: TEdge, startEdge: TEdge | null): void {
        if (this.m_ActiveEdges === null) {
            edge.PrevInAEL = null;
            edge.NextInAEL = null;
            this.m_ActiveEdges = edge;
        } else if (startEdge === null && edge.insertsBefore(this.m_ActiveEdges)) {
            edge.PrevInAEL = null;
            edge.NextInAEL = this.m_ActiveEdges;
            this.m_ActiveEdges.PrevInAEL = edge;
            this.m_ActiveEdges = edge;
        } else {
            if (startEdge === null) startEdge = this.m_ActiveEdges;
            while (startEdge.NextInAEL !== null && !edge.insertsBefore(startEdge.NextInAEL)) startEdge = startEdge.NextInAEL;
            edge.NextInAEL = startEdge.NextInAEL;
            if (startEdge.NextInAEL !== null) {
                startEdge.NextInAEL.PrevInAEL = edge;
            }
            edge.PrevInAEL = startEdge;
            startEdge.NextInAEL = edge;
        }
    }

    private IsContributing(edge: TEdge): boolean {
        return edge.getContributing(this.m_ClipType, this.m_ClipFillType, this.m_SubjFillType);
    }

    private PopLocalMinima(): void {
        if (this.currentLM !== null) {
            this.currentLM = this.currentLM.Next;
        }
    }

    private ProcessIntersections(botY: number, topY: number): boolean {
        if (this.m_ActiveEdges === null) {
            return true;
        }

        try {
            this.BuildIntersectList(botY, topY);

            if (this.m_IntersectList.length === 0) {
                return true;
            }

            if (this.m_IntersectList.length === 1 || this.FixupIntersectionOrder()) {
                this.ProcessIntersectList();
            } else {
                return false;
            }
        } catch ($$e2) {
            this.m_SortedEdges = null;
            this.m_IntersectList.length = 0;

            showError('ProcessIntersections error');
        }

        this.m_SortedEdges = null;

        return true;
    }

    private SetWindingCount(edge: TEdge): void {
        let e: TEdge | null = edge.PrevInAEL;
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (e !== null && (e.PolyTyp !== edge.PolyTyp || e.WindDelta === 0)) e = e.PrevInAEL;
        if (e === null) {
            edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
            edge.WindCnt2 = 0;
            e = this.m_ActiveEdges;
            //ie get ready to calc WindCnt2
        } else if (edge.WindDelta === 0 && this.m_ClipType !== ClipType.ctUnion) {
            edge.WindCnt = 1;
            edge.WindCnt2 = e.WindCnt2;
            e = e.NextInAEL;
            //ie get ready to calc WindCnt2
        } else if (this.IsEvenOddFillType(edge)) {
            //EvenOdd filling ...
            if (edge.WindDelta === 0) {
                //are we inside a subj polygon ...
                let Inside: boolean = true;
                let e2: TEdge | null = e.PrevInAEL;
                while (e2 !== null) {
                    if (e2.PolyTyp === e.PolyTyp && e2.WindDelta !== 0) Inside = !Inside;
                    e2 = e2.PrevInAEL;
                }
                edge.WindCnt = Inside ? 0 : 1;
            } else {
                edge.WindCnt = edge.WindDelta;
            }
            edge.WindCnt2 = e.WindCnt2;
            e = e.NextInAEL;
            //ie get ready to calc WindCnt2
        } else {
            //nonZero, Positive or Negative filling ...
            if (e.WindCnt * e.WindDelta < 0) {
                //prev edge is 'decreasing' WindCount (WC) toward zero
                //so we're outside the previous polygon ...
                if (Math.abs(e.WindCnt) > 1) {
                    //outside prev poly but still inside another.
                    //when reversing direction of prev poly use the same WC
                    if (e.WindDelta * edge.WindDelta < 0) edge.WindCnt = e.WindCnt;
                    else edge.WindCnt = e.WindCnt + edge.WindDelta;
                } else edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
            } else {
                //prev edge is 'increasing' WindCount (WC) away from zero
                //so we're inside the previous polygon ...
                if (edge.WindDelta === 0) edge.WindCnt = e.WindCnt < 0 ? e.WindCnt - 1 : e.WindCnt + 1;
                else if (e.WindDelta * edge.WindDelta < 0) edge.WindCnt = e.WindCnt;
                else edge.WindCnt = e.WindCnt + edge.WindDelta;
            }
            edge.WindCnt2 = e.WindCnt2;
            e = e.NextInAEL;
            //ie get ready to calc WindCnt2
        }
        //update WindCnt2 ...
        if (this.IsEvenOddAltFillType(edge)) {
            //EvenOdd filling ...
            while (e !== edge) {
                if (e.WindDelta !== 0) edge.WindCnt2 = edge.WindCnt2 === 0 ? 1 : 0;
                e = e.NextInAEL;
            }
        } else {
            //nonZero, Positive or Negative filling ...
            while (e !== edge) {
                edge.WindCnt2 += e.WindDelta;
                e = e.NextInAEL;
            }
        }
    }

    private IsEvenOddAltFillType(edge: TEdge) {
        if (edge.PolyTyp === PolyType.ptSubject) return this.m_ClipFillType === PolyFillType.pftEvenOdd;
        else return this.m_SubjFillType === PolyFillType.pftEvenOdd;
    }

    private ProcessIntersectList(): void {
        const intersectCount: number = this.m_IntersectList.length;
        let i: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            node = this.m_IntersectList[i];
            this.IntersectEdges(node.Edge1, node.Edge2, node.Pt, true);
            this.SwapPositionsInAEL(node.Edge1, node.Edge2);
        }

        this.m_IntersectList = [];
    }

    private IntersectEdges(edge1: TEdge, edge2: TEdge, point: Point, isProtect: boolean) {
        //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
        //e2 in AEL except when e1 is being inserted at the intersection point ...
        let edge1Stops: boolean = !isProtect && edge1.NextInLML === null && edge1.Top.x === point.x && edge1.Top.y === point.y;
        let edge2Stops: boolean = !isProtect && edge2.NextInLML === null && edge2.Top.x === point.x && edge2.Top.y === point.y;
        let edge1Contributing: boolean = edge1.OutIdx >= 0;
        let edge2Contributing: boolean = edge2.OutIdx >= 0;

        //if either edge is on an OPEN path ...
        if (edge1.WindDelta === 0 || edge2.WindDelta === 0) {
            //ignore subject-subject open path intersections UNLESS they
            //are both open paths, AND they are both 'contributing maximas' ...
            if (edge1.WindDelta === 0 && edge2.WindDelta === 0) {
                if ((edge1Stops || edge2Stops) && edge1Contributing && edge2Contributing) {
                    this.AddLocalMaxPoly(edge1, edge2, point);
                }
            }
            //if intersecting a subj line with a subj poly ...
            else if (
                edge1.PolyTyp === edge2.PolyTyp &&
                edge1.WindDelta !== edge2.WindDelta &&
                this.m_ClipType === ClipType.ctUnion
            ) {
                if (edge1.WindDelta === 0) {
                    if (edge2Contributing) {
                        this.AddOutPt(edge1, point);

                        if (edge1Contributing) {
                            edge1.OutIdx = -1;
                        }
                    }
                } else {
                    if (edge1Contributing) {
                        this.AddOutPt(edge2, point);

                        if (edge2Contributing) {
                            edge2.OutIdx = -1;
                        }
                    }
                }
            } else if (edge1.PolyTyp !== edge2.PolyTyp) {
                if (
                    edge1.WindDelta === 0 &&
                    Math.abs(edge2.WindCnt) === 1 &&
                    (this.m_ClipType !== ClipType.ctUnion || edge2.WindCnt2 === 0)
                ) {
                    this.AddOutPt(edge1, point);

                    if (edge1Contributing) {
                        edge1.OutIdx = -1;
                    }
                } else if (
                    edge2.WindDelta === 0 &&
                    Math.abs(edge1.WindCnt) === 1 &&
                    (this.m_ClipType !== ClipType.ctUnion || edge1.WindCnt2 === 0)
                ) {
                    this.AddOutPt(edge2, point);
                    if (edge2Contributing) {
                        edge2.OutIdx = -1;
                    }
                }
            }
            if (edge1Stops) {
                if (edge1.OutIdx < 0) {
                    this.m_ActiveEdges = edge1.deleteFromAEL(this.m_ActiveEdges);
                } else {
                    showError('Error intersecting polylines');
                }
            }
            if (edge2Stops) {
                if (edge2.OutIdx < 0) {
                    this.m_ActiveEdges = edge2.deleteFromAEL(this.m_ActiveEdges);
                } else {
                    showError('Error intersecting polylines');
                }
            }
            return;
        }

        //update winding counts...
        //assumes that e1 will be to the Right of e2 ABOVE the intersection
        if (edge1.PolyTyp === edge2.PolyTyp) {
            if (this.IsEvenOddFillType(edge1)) {
                const oldE1WindCnt: number = edge1.WindCnt;
                edge1.WindCnt = edge2.WindCnt;
                edge2.WindCnt = oldE1WindCnt;
            } else {
                if (edge1.WindCnt + edge2.WindDelta === 0) {
                    edge1.WindCnt = -edge1.WindCnt;
                } else {
                    edge1.WindCnt += edge2.WindDelta;
                }

                if (edge2.WindCnt - edge1.WindDelta === 0) {
                    edge2.WindCnt = -edge2.WindCnt;
                } else {
                    edge2.WindCnt -= edge1.WindDelta;
                }
            }
        } else {
            if (!this.IsEvenOddFillType(edge2)) {
                edge1.WindCnt2 += edge2.WindDelta;
            } else {
                edge1.WindCnt2 = edge1.WindCnt2 === 0 ? 1 : 0;
            }

            if (!this.IsEvenOddFillType(edge1)) {
                edge2.WindCnt2 -= edge1.WindDelta;
            } else {
                edge2.WindCnt2 = edge2.WindCnt2 === 0 ? 1 : 0;
            }
        }
        let e1FillType: PolyFillType;
        let e2FillType: PolyFillType;
        let e1FillType2: PolyFillType;
        let e2FillType2: PolyFillType;

        if (edge1.PolyTyp === PolyType.ptSubject) {
            e1FillType = this.m_SubjFillType;
            e1FillType2 = this.m_ClipFillType;
        } else {
            e1FillType = this.m_ClipFillType;
            e1FillType2 = this.m_SubjFillType;
        }

        if (edge2.PolyTyp === PolyType.ptSubject) {
            e2FillType = this.m_SubjFillType;
            e2FillType2 = this.m_ClipFillType;
        } else {
            e2FillType = this.m_ClipFillType;
            e2FillType2 = this.m_SubjFillType;
        }

        let e1Wc: number = 0;
        let e2Wc: number = 0;

        switch (e1FillType) {
            case PolyFillType.pftPositive:
                e1Wc = edge1.WindCnt;
                break;
            case PolyFillType.pftNegative:
                e1Wc = -edge1.WindCnt;
                break;
            default:
                e1Wc = Math.abs(edge1.WindCnt);
                break;
        }

        switch (e2FillType) {
            case PolyFillType.pftPositive:
                e2Wc = edge2.WindCnt;
                break;
            case PolyFillType.pftNegative:
                e2Wc = -edge2.WindCnt;
                break;
            default:
                e2Wc = Math.abs(edge2.WindCnt);
                break;
        }

        if (edge1Contributing && edge2Contributing) {
            if (
                edge1Stops ||
                edge2Stops ||
                (e1Wc !== 0 && e1Wc !== 1) ||
                (e2Wc !== 0 && e2Wc !== 1) ||
                (edge1.PolyTyp !== edge2.PolyTyp && this.m_ClipType !== ClipType.ctXor)
            ) {
                this.AddLocalMaxPoly(edge1, edge2, point);
            } else {
                this.AddOutPt(edge1, point);
                this.AddOutPt(edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                this.AddOutPt(edge1, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                this.AddOutPt(edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            let e1Wc2: number = 0;
            let e2Wc2: number = 0;

            switch (e1FillType2) {
                case PolyFillType.pftPositive:
                    e1Wc2 = edge1.WindCnt2;
                    break;
                case PolyFillType.pftNegative:
                    e1Wc2 = -edge1.WindCnt2;
                    break;
                default:
                    e1Wc2 = Math.abs(edge1.WindCnt2);
                    break;
            }

            switch (e2FillType2) {
                case PolyFillType.pftPositive:
                    e2Wc2 = edge2.WindCnt2;
                    break;
                case PolyFillType.pftNegative:
                    e2Wc2 = -edge2.WindCnt2;
                    break;
                default:
                    e2Wc2 = Math.abs(edge2.WindCnt2);
                    break;
            }

            if (edge1.PolyTyp !== edge2.PolyTyp) {
                this.AddLocalMinPoly(edge1, edge2, point);
            } else if (e1Wc === 1 && e2Wc === 1) {
                switch (this.m_ClipType) {
                    case ClipType.ctIntersection:
                        if (e1Wc2 > 0 && e2Wc2 > 0) {
                            this.AddLocalMinPoly(edge1, edge2, point);
                        }
                        break;
                    case ClipType.ctUnion:
                        if (e1Wc2 <= 0 && e2Wc2 <= 0) {
                            this.AddLocalMinPoly(edge1, edge2, point);
                        }
                        break;
                    case ClipType.ctDifference:
                        if (
                            (edge1.PolyTyp === PolyType.ptClip && e1Wc2 > 0 && e2Wc2 > 0) ||
                            (edge1.PolyTyp === PolyType.ptSubject && e1Wc2 <= 0 && e2Wc2 <= 0)
                        ) {
                            this.AddLocalMinPoly(edge1, edge2, point);
                        }
                        break;
                    case ClipType.ctXor:
                        this.AddLocalMinPoly(edge1, edge2, point);
                        break;
                }
            } else {
                TEdge.swapSides(edge1, edge2);
            }
        }
        if (edge1Stops !== edge2Stops && ((edge1Stops && edge1.OutIdx >= 0) || (edge2Stops && edge2.OutIdx >= 0))) {
            TEdge.swapSides(edge1, edge2);
            TEdge.swapPolyIndexes(edge1, edge2);
        }
        //finally, delete any non-contributing maxima edges  ...
        if (edge1Stops) {
            this.m_ActiveEdges = edge1.deleteFromAEL(this.m_ActiveEdges);
        }
        if (edge2Stops) {
            this.m_ActiveEdges = edge2.deleteFromAEL(this.m_ActiveEdges);
        }
    }

    private AddLocalMaxPoly(e1: TEdge, e2: TEdge, pt: Point): void {
        this.AddOutPt(e1, pt);

        if (e2.WindDelta === 0) {
            this.AddOutPt(e2, pt);
        }

        if (e1.OutIdx === e2.OutIdx) {
            e1.OutIdx = -1;
            e2.OutIdx = -1;
        } else if (e1.OutIdx < e2.OutIdx) {
            this.AppendPolygon(e1, e2);
        } else {
            this.AppendPolygon(e2, e1);
        }
    }

    private AppendPolygon(e1: TEdge, e2: TEdge): void {
        //get the start and ends of both output polygons ...
        const outRec1: OutRec = this.m_PolyOuts[e1.OutIdx];
        const outRec2 = this.m_PolyOuts[e2.OutIdx];
        let holeStateRec: OutRec | null = null;

        if (OutRec.param1RightOfParam2(outRec1, outRec2)) {
            holeStateRec = outRec2;
        } else if (OutRec.param1RightOfParam2(outRec2, outRec1)) {
            holeStateRec = outRec1;
        } else {
            holeStateRec = this.GetLowermostRec(outRec1, outRec2);
        }

        const p1_lft: OutPt = outRec1.Pts;
        const p1_rt: OutPt = p1_lft.Prev;
        const p2_lft: OutPt = outRec2.Pts;
        const p2_rt: OutPt = p2_lft.Prev;
        let side: EdgeSide;
        //join e2 poly onto e1 poly and delete pointers to e2 ...
        if (e1.Side === EdgeSide.esLeft) {
            if (e2.Side === EdgeSide.esLeft) {
                //z y x a b c
                p2_lft.reverse();
                p2_lft.Next = p1_lft;
                p1_lft.Prev = p2_lft;
                p1_rt.Next = p2_rt;
                p2_rt.Prev = p1_rt;
                outRec1.Pts = p2_rt;
            } else {
                //x y z a b c
                p2_rt.Next = p1_lft;
                p1_lft.Prev = p2_rt;
                p2_lft.Prev = p1_rt;
                p1_rt.Next = p2_lft;
                outRec1.Pts = p2_lft;
            }
            side = EdgeSide.esLeft;
        } else {
            if (e2.Side === EdgeSide.esRight) {
                //a b c z y x
                p2_lft.reverse();
                p1_rt.Next = p2_rt;
                p2_rt.Prev = p1_rt;
                p2_lft.Next = p1_lft;
                p1_lft.Prev = p2_lft;
            } else {
                //a b c x y z
                p1_rt.Next = p2_lft;
                p2_lft.Prev = p1_rt;
                p1_lft.Prev = p2_rt;
                p2_rt.Next = p1_lft;
            }
            side = EdgeSide.esRight;
        }
        outRec1.BottomPt = null;

        if (holeStateRec === outRec2) {
            if (outRec2.FirstLeft !== outRec1) {
                outRec1.FirstLeft = outRec2.FirstLeft;
            }

            outRec1.IsHole = outRec2.IsHole;
        }

        outRec2.Pts = null;
        outRec2.BottomPt = null;
        outRec2.FirstLeft = outRec1;
        const OKIdx: number = e1.OutIdx;
        const ObsoleteIdx: number = e2.OutIdx;
        e1.OutIdx = -1;
        //nb: safe because we only get here via AddLocalMaxPoly
        e2.OutIdx = -1;

        let e: TEdge = this.m_ActiveEdges;

        while (e !== null) {
            if (e.OutIdx === ObsoleteIdx) {
                e.OutIdx = OKIdx;
                e.Side = side;
                break;
            }
            e = e.NextInAEL;
        }

        outRec2.Idx = outRec1.Idx;
    }

    private GetLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        //work out which polygon fragment has the correct hole state ...
        if (outRec1.BottomPt === null) {
            outRec1.BottomPt = outRec1.Pts.getBottomPt();
        }
        if (outRec2.BottomPt === null) {
            outRec2.BottomPt = outRec2.Pts.getBottomPt();
        }

        const bPt1: OutPt | null = outRec1.BottomPt;
        const bPt2: OutPt | null = outRec2.BottomPt;

        if (bPt1.Pt.y > bPt2.Pt.y) {
            return outRec1;
        } else if (bPt1.Pt.y < bPt2.Pt.y) {
            return outRec2;
        } else if (bPt1.Pt.x < bPt2.Pt.x) {
            return outRec1;
        } else if (bPt1.Pt.x > bPt2.Pt.x) {
            return outRec2;
        } else if (bPt1.Next === bPt1) {
            return outRec2;
        } else if (bPt2.Next === bPt2) {
            return outRec1;
        } else if (OutPt.firstIsBottomPt(bPt1, bPt2)) {
            return outRec1;
        } else {
            return outRec2;
        }
    }

    private AddLocalMinPoly(e1: TEdge, e2: TEdge, pt: Point) {
        let result: OutPt = null;
        let e: TEdge = null;
        let prevE: TEdge;

        if (e2.isHorizontal || e1.Dx > e2.Dx) {
            result = this.AddOutPt(e1, pt);
            e2.OutIdx = e1.OutIdx;
            e1.Side = EdgeSide.esLeft;
            e2.Side = EdgeSide.esRight;
            e = e1;

            if (e.PrevInAEL === e2) {
                prevE = e2.PrevInAEL;
            } else {
                prevE = e.PrevInAEL;
            }
        } else {
            result = this.AddOutPt(e2, pt);
            e1.OutIdx = e2.OutIdx;
            e1.Side = EdgeSide.esRight;
            e2.Side = EdgeSide.esLeft;
            e = e2;

            if (e.PrevInAEL === e1) {
                prevE = e1.PrevInAEL;
            } else {
                prevE = e.PrevInAEL;
            }
        }
        if (
            prevE !== null &&
            prevE.OutIdx >= 0 &&
            prevE.topX(pt.y) === e.topX(pt.y) &&
            TEdge.slopesEqual(e, prevE, this.isUseFullRange) &&
            e.WindDelta !== 0 &&
            prevE.WindDelta !== 0
        ) {
            const outPt: OutPt | null = this.AddOutPt(prevE, pt);
            this.AddJoin(result, outPt, e.Top);
        }
        return result;
    }

    private AddJoin(outPt1: OutPt, outPt2: OutPt, offPoint: Point): void {
        this.m_Joins.push(new Join(outPt1, outPt2, offPoint));
    }

    private BuildResult(polygons: Point[][]): void {
        const polygonCount = this.m_PolyOuts.length;
        let outRec: OutRec = null;
        let polygon: Point[] | null = null;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            outRec = this.m_PolyOuts[i];
            polygon = outRec.export();

            if (polygon !== null) {
                polygons.push(polygon);
            }
        }
    }

    private AddOutPt(edge: TEdge, point: Point) {
        const isToFront: boolean = edge.Side === EdgeSide.esLeft;
        let outRec: OutRec = null;
        let newOp: OutPt = null;

        if (edge.OutIdx < 0) {
            newOp = new OutPt();
            outRec = OutRec.create(this.m_PolyOuts, edge.WindDelta === 0, newOp);
            outRec.Pts = newOp;
            newOp.Idx = outRec.Idx;
            //newOp.Pt = pt;
            newOp.Pt.x = point.x;
            newOp.Pt.y = point.y;
            newOp.Next = newOp;
            newOp.Prev = newOp;

            if (!outRec.IsOpen) {
                outRec.setHoleState(edge, this.m_PolyOuts);
            }

            edge.OutIdx = outRec.Idx;
            //nb: do this after SetZ !
            return newOp;
        } else {
            outRec = this.m_PolyOuts[edge.OutIdx];
            //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
            const op: OutPt = outRec.Pts;

            if (isToFront && op_Equality(point, op.Pt)) {
                return op;
            } else if (!isToFront && op_Equality(point, op.Prev.Pt)) {
                return op.Prev;
            }

            newOp = new OutPt();
            newOp.Idx = outRec.Idx;
            //newOp.Pt = pt;
            newOp.Pt.x = point.x;
            newOp.Pt.y = point.y;
            newOp.Next = op;
            newOp.Prev = op.Prev;
            newOp.Prev.Next = newOp;
            op.Prev = newOp;

            if (isToFront) {
                outRec.Pts = newOp;
            }

            return newOp;
        }
    }

    private IsEvenOddFillType(edge: TEdge): boolean {
        return edge.PolyTyp === PolyType.ptSubject
            ? this.m_SubjFillType === PolyFillType.pftEvenOdd
            : this.m_ClipFillType === PolyFillType.pftEvenOdd;
    }

    protected Reset(): void {
        super.Reset();

        this.m_Scanbeam = this.minimaList !== null ? this.minimaList.getScanbeam() : null;
        this.m_ActiveEdges = null;
        this.m_SortedEdges = null;
    }

    private PopScanbeam(): number {
        const result: number = this.m_Scanbeam.Y;

        this.m_Scanbeam = this.m_Scanbeam.Next;

        return result;
    }

    private DisposeAllPolyPts(): void {
        const polyCount: number = this.m_PolyOuts.length;
        let outRec: OutRec = null;
        let i: number = 0;

        for (i = 0; i < polyCount; ++i) {
            outRec = this.m_PolyOuts[i];
            outRec.dispose();
        }

        this.m_PolyOuts = [];
    }

    private ProcessHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdge: TEdge = this.m_SortedEdges;

        while (horzEdge !== null) {
            this.m_SortedEdges = horzEdge.deleteFromSEL(this.m_SortedEdges);

            this.ProcessHorizontal(horzEdge, isTopOfScanbeam);

            horzEdge = this.m_SortedEdges;
        }
    }

    GetHorzDirection(HorzEdge: TEdge, $var: { Dir: Direction; Left: number; Right: number }) {
        if (HorzEdge.Bot.x < HorzEdge.Top.x) {
            $var.Left = HorzEdge.Bot.x;
            $var.Right = HorzEdge.Top.x;
            $var.Dir = Direction.dLeftToRight;
        } else {
            $var.Left = HorzEdge.Top.x;
            $var.Right = HorzEdge.Bot.x;
            $var.Dir = Direction.dRightToLeft;
        }
    }

    private ProcessHorizontal(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        let dirValue: { Dir: Direction; Left: number; Right: number } = { Dir: null, Left: null, Right: null };
        this.GetHorzDirection(horzEdge, dirValue);
        let dir: Direction = dirValue.Dir;
        let horzLeft: number = dirValue.Left;
        let horzRight: number = dirValue.Right;

        let eLastHorz: TEdge | null = horzEdge;
        let eMaxPair: TEdge | null = null;

        while (eLastHorz.NextInLML !== null && eLastHorz.NextInLML.isHorizontal) {
            eLastHorz = eLastHorz.NextInLML;
        }

        if (eLastHorz.NextInLML === null) {
            eMaxPair = this.GetMaximaPair(eLastHorz);
        }

        while (true) {
            const isLastHorz: boolean = horzEdge === eLastHorz;
            let e: TEdge | null = this.GetNextInAEL(horzEdge, dir);
            let eNext: TEdge | null = null;

            while (e !== null) {
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (e.Curr.x === horzEdge.Top.x && horzEdge.NextInLML !== null && e.Dx < horzEdge.NextInLML.Dx) {
                    break;
                }

                eNext = this.GetNextInAEL(e, dir);
                //saves eNext for later
                if (
                    (dir === Direction.dLeftToRight && e.Curr.x <= horzRight) ||
                    (dir === Direction.dRightToLeft && e.Curr.x >= horzLeft)
                ) {
                    if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta !== 0) {
                        this.PrepareHorzJoins(horzEdge, isTopOfScanbeam);
                    }

                    //so far we're still in range of the horizontal Edge  but make sure
                    //we're at the last of consec. horizontals when matching with eMaxPair
                    if (e === eMaxPair && isLastHorz) {
                        if (dir === Direction.dLeftToRight) {
                            this.IntersectEdges(horzEdge, e, e.Top, false);
                        } else {
                            this.IntersectEdges(e, horzEdge, e.Top, false);
                        }
                        if (eMaxPair.OutIdx >= 0) {
                            showError('ProcessHorizontal error');
                        }

                        return;
                    } else if (dir === Direction.dLeftToRight) {
                        const Pt: Point = Point.create(e.Curr.x, horzEdge.Curr.y);
                        this.IntersectEdges(horzEdge, e, Pt, true);
                    } else {
                        const Pt: Point = Point.create(e.Curr.x, horzEdge.Curr.y);
                        this.IntersectEdges(e, horzEdge, Pt, true);
                    }
                    this.SwapPositionsInAEL(horzEdge, e);
                } else if (
                    (dir === Direction.dLeftToRight && e.Curr.x >= horzRight) ||
                    (dir === Direction.dRightToLeft && e.Curr.x <= horzLeft)
                )
                    break;
                e = eNext;
            }
            //end while
            if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta !== 0) {
                this.PrepareHorzJoins(horzEdge, isTopOfScanbeam);
            }

            if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
                horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
                if (horzEdge.OutIdx >= 0) this.AddOutPt(horzEdge, horzEdge.Bot);

                dirValue = { Dir: dir, Left: horzLeft, Right: horzRight };
                this.GetHorzDirection(horzEdge, dirValue);
                dir = dirValue.Dir;
                horzLeft = dirValue.Left;
                horzRight = dirValue.Right;
            } else {
                break;
            }
        }
        //end for (;;)
        if (horzEdge.NextInLML !== null) {
            if (horzEdge.OutIdx >= 0) {
                const op1: OutPt | null = this.AddOutPt(horzEdge, horzEdge.Top);
                horzEdge = this.UpdateEdgeIntoAEL(horzEdge);

                if (horzEdge.WindDelta === 0) {
                    return;
                }
                //nb: HorzEdge is no longer horizontal here
                let ePrev: TEdge | null = horzEdge.PrevInAEL;
                let eNext: TEdge | null = horzEdge.NextInAEL;

                if (
                    ePrev !== null &&
                    ePrev.Curr.x === horzEdge.Bot.x &&
                    ePrev.Curr.y === horzEdge.Bot.y &&
                    ePrev.WindDelta !== 0 &&
                    ePrev.OutIdx >= 0 &&
                    ePrev.Curr.y > ePrev.Top.y &&
                    TEdge.slopesEqual(horzEdge, ePrev, this.isUseFullRange)
                ) {
                    const op2: OutPt = this.AddOutPt(ePrev, horzEdge.Bot);
                    this.AddJoin(op1, op2, horzEdge.Top);
                } else if (
                    eNext !== null &&
                    eNext.Curr.x === horzEdge.Bot.x &&
                    eNext.Curr.y === horzEdge.Bot.y &&
                    eNext.WindDelta !== 0 &&
                    eNext.OutIdx >= 0 &&
                    eNext.Curr.y > eNext.Top.y &&
                    TEdge.slopesEqual(horzEdge, eNext, this.isUseFullRange)
                ) {
                    const op2: OutPt | null = this.AddOutPt(eNext, horzEdge.Bot);
                    this.AddJoin(op1, op2, horzEdge.Top);
                }
            } else {
                horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
            }
        } else if (eMaxPair !== null) {
            if (eMaxPair.OutIdx >= 0) {
                if (dir === Direction.dLeftToRight) this.IntersectEdges(horzEdge, eMaxPair, horzEdge.Top, false);
                else this.IntersectEdges(eMaxPair, horzEdge, horzEdge.Top, false);
                if (eMaxPair.OutIdx >= 0) showError('ProcessHorizontal error');
            } else {
                this.m_ActiveEdges = horzEdge.deleteFromAEL(this.m_ActiveEdges);
                this.m_ActiveEdges = eMaxPair.deleteFromAEL(this.m_ActiveEdges);
            }
        } else {
            if (horzEdge.OutIdx >= 0) {
                this.AddOutPt(horzEdge, horzEdge.Top);
            }
            this.m_ActiveEdges = horzEdge.deleteFromAEL(this.m_ActiveEdges);
        }
    }

    GetMaximaPair(e: TEdge): TEdge | null {
        let result: TEdge | null = null;

        if (op_Equality(e.Next.Top, e.Top) && e.Next.NextInLML === null) {
            result = e.Next;
        } else if (op_Equality(e.Prev.Top, e.Top) && e.Prev.NextInLML === null) {
            result = e.Prev;
        }

        return result !== null && (result.OutIdx === -2 || (result.NextInAEL === result.PrevInAEL && !result.isHorizontal))
            ? null
            : result;
    }

    private PrepareHorzJoins(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        let outPt: OutPt | null = this.m_PolyOuts[horzEdge.OutIdx].Pts;
        if (horzEdge.Side !== EdgeSide.esLeft) {
            outPt = outPt.Prev;
        }

        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        if (isTopOfScanbeam)
            if (op_Equality(outPt.Pt, horzEdge.Top)) this.AddGhostJoin(outPt, horzEdge.Bot);
            else this.AddGhostJoin(outPt, horzEdge.Top);
    }

    private AddGhostJoin(Op: OutPt, OffPt: Point) {
        this.m_GhostJoins.push(new Join(Op, null, OffPt));
    }

    private GetNextInAEL(e: TEdge, direction: Direction): TEdge {
        return direction === Direction.dLeftToRight ? e.NextInAEL : e.PrevInAEL;
    }

    private UpdateEdgeIntoAEL(e: TEdge) {
        if (e.NextInLML === null) {
            showError('UpdateEdgeIntoAEL: invalid call');
        }

        const AelPrev: TEdge | null = e.PrevInAEL;
        const AelNext: TEdge | null = e.NextInAEL;
        e.NextInLML.OutIdx = e.OutIdx;

        if (AelPrev !== null) {
            AelPrev.NextInAEL = e.NextInLML;
        } else {
            this.m_ActiveEdges = e.NextInLML;
        }

        if (AelNext !== null) {
            AelNext.PrevInAEL = e.NextInLML;
        }

        e.NextInLML.Side = e.Side;
        e.NextInLML.WindDelta = e.WindDelta;
        e.NextInLML.WindCnt = e.WindCnt;
        e.NextInLML.WindCnt2 = e.WindCnt2;
        e = e.NextInLML;
        //    e.Curr = e.Bot;
        e.Curr.x = e.Bot.x;
        e.Curr.y = e.Bot.y;
        e.PrevInAEL = AelPrev;
        e.NextInAEL = AelNext;

        if (!e.isHorizontal) {
            this.m_Scanbeam = Scanbeam.insert(e.Top.y, this.m_Scanbeam);
        }

        return e;
    }

    private DoSimplePolygons(): void {
        let i: number = 0;
        let outPt: OutPt = null;
        let outRec: OutRec = null;

        while (i < this.m_PolyOuts.length) {
            outRec = this.m_PolyOuts[i++];
            outPt = outRec.Pts;

            if (outPt !== null) {
                outRec.simplify(outPt, this.m_PolyOuts);
            }
        }
    }

    private FixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.m_IntersectList.sort(Clipper.IntersectNodeSort);

        this.CopyAELToSEL();

        const intersectCount: number = this.m_IntersectList.length;
        let i: number = 0;
        let j: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            if (!this.m_IntersectList[i].edgesAdjacent) {
                j = i + 1;

                while (j < intersectCount && !this.m_IntersectList[j].edgesAdjacent) {
                    ++j;
                }

                if (j === intersectCount) {
                    return false;
                }

                node = this.m_IntersectList[i];
                this.m_IntersectList[i] = this.m_IntersectList[j];
                this.m_IntersectList[j] = node;
            }

            this.SwapPositionsInSEL(this.m_IntersectList[i].Edge1, this.m_IntersectList[i].Edge2);
        }

        return true;
    }

    private SwapPositionsInAEL(edge1: TEdge, edge2: TEdge): void {
        if (!TEdge.swapPositionsInAEL(edge1, edge2)) {
            return;
        }

        if (edge1.PrevInAEL === null) {
            this.m_ActiveEdges = edge1;
        } else if (edge2.PrevInAEL === null) {
            this.m_ActiveEdges = edge2;
        }
    }

    private SwapPositionsInSEL(edge1: TEdge, edge2: TEdge) {
        if (!TEdge.swapPositionsInSEL(edge1, edge2)) {
            return;
        }

        if (edge1.PrevInSEL === null) {
            this.m_SortedEdges = edge1;
        } else if (edge2.PrevInSEL === null) {
            this.m_SortedEdges = edge2;
        }
    }

    private CopyAELToSEL(): void {
        let edge: TEdge = this.m_ActiveEdges;
        this.m_SortedEdges = edge;

        while (edge !== null) {
            edge = edge.copyAELToSEL();
        }
    }

    private BuildIntersectList = function (botY: number, topY: number): void {
        if (this.m_ActiveEdges === null) {
            return;
        }
        //prepare for sorting ...
        let edge: TEdge = this.m_ActiveEdges;
        //console.log(JSON.stringify(JSON.decycle( e )));
        this.m_SortedEdges = edge;
        while (edge !== null) {
            edge.PrevInSEL = edge.PrevInAEL;
            edge.NextInSEL = edge.NextInAEL;
            edge.Curr.x = edge.topX(topY);
            edge = edge.NextInAEL;
        }
        //bubblesort ...
        let isModified: boolean = true;
        let nextEdge: TEdge = null;
        let point: Point = null;

        while (isModified && this.m_SortedEdges !== null) {
            isModified = false;
            edge = this.m_SortedEdges;

            while (edge.NextInSEL !== null) {
                nextEdge = edge.NextInSEL;
                point = Point.zero();
                //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
                if (edge.Curr.x > nextEdge.Curr.x) {
                    if (
                        !TEdge.intersectPoint(edge, nextEdge, point, this.m_UseFullRange) &&
                        edge.Curr.x > nextEdge.Curr.x + 1
                    ) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.y = botY;
                        point.x = Math.abs(edge.Dx) > Math.abs(nextEdge.Dx) ? nextEdge.topX(botY) : edge.topX(botY);
                    }

                    this.m_IntersectList.push(new IntersectNode(edge, nextEdge, point));
                    this.SwapPositionsInSEL(edge, nextEdge);
                    isModified = true;
                } else {
                    edge = nextEdge;
                }
            }

            if (edge.PrevInSEL !== null) {
                edge.PrevInSEL.NextInSEL = null;
            } else {
                break;
            }
        }
        this.m_SortedEdges = null;
    };

    private static IntersectNodeSort(node1: IntersectNode, node2: IntersectNode): number {
        //the following typecast is safe because the differences in Pt.Y will
        //be limited to the height of the scanbeam.
        return node2.Pt.y - node1.Pt.y;
    }
}
