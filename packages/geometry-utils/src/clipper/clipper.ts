import Point from '../point';
import ClipperBase from './clipper-base';
import { showError } from './helpers';
import IntersectNode from './intersect-node';
import Join from './join';
import OutPt from './out-pt';
import OutRec from './out-rec';
import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from './types';

export default class Clipper extends ClipperBase {
    private clipType: ClipType = ClipType.ctIntersection;
    private fillType: PolyFillType = PolyFillType.pftEvenOdd;
    private scanbeam: Scanbeam | null = null;
    private m_ActiveEdges: TEdge = null;
    private m_SortedEdges: TEdge = null;
    private m_IntersectList: IntersectNode[] = [];
    private isExecuteLocked: boolean = false;
    private m_PolyOuts: OutRec[] = [];
    private joins: Join[] = [];
    private ghostJoins: Join[] = [];
    public ReverseSolution: boolean = false;
    public StrictlySimple: boolean = false;

    public execute(clipType: ClipType, solution: Point[][], fillType: PolyFillType): boolean {
        if (this.isExecuteLocked) {
            return false;
        }

        this.isExecuteLocked = true;
        this.fillType = fillType;
        this.clipType = clipType;

        solution.length = 0;

        let succeeded: boolean = false;

        try {
            succeeded = this.executeInternal();
            //build the return polygons ...
            if (succeeded) {
                this.buildResult(solution);
            }
        } finally {
            this.disposeAllPolyPts();
            this.isExecuteLocked = false;
        }

        return succeeded;
    }

    private executeInternal(): boolean {
        try {
            this.reset();

            if (this.currentLM === null) {
                return false;
            }

            let i: number = 0;
            let outRec: OutRec = null;
            let outRecCount: number = 0;
            let botY: number = this.popScanbeam();
            let topY: number = 0;

            do {
                this.insertLocalMinimaIntoAEL(botY);
                this.ghostJoins = [];
                this.processHorizontals(false);

                if (this.scanbeam === null) {
                    break;
                }

                topY = this.popScanbeam();
                //console.log("botY:" + botY + ", topY:" + topY);
                if (!this.processIntersections(botY, topY)) {
                    return false;
                }

                this.processEdgesAtTopOfScanbeam(topY);

                botY = topY;
            } while (this.scanbeam !== null || this.currentLM !== null);
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

            const joinCount: number = this.joins.length;

            for (i = 0; i < joinCount; ++i) {
                this.joins[i].joinCommonEdges(this.m_PolyOuts, this.isUseFullRange, this.ReverseSolution);
            }

            outRecCount = this.m_PolyOuts.length;

            for (i = 0; i < outRecCount; ++i) {
                outRec = this.m_PolyOuts[i];

                if (!outRec.isEmpty) {
                    outRec.fixupOutPolygon(false, this.isUseFullRange);
                }
            }

            if (this.StrictlySimple) {
                this.doSimplePolygons();
            }

            return true;
        } finally {
            this.joins = [];
            this.ghostJoins = [];
        }
    }

    private processEdgesAtTopOfScanbeam(topY: number): void {
        let edge1: TEdge = this.m_ActiveEdges;
        let edge2: TEdge | null = null;
        let isMaximaEdge: boolean = false;
        let outPt1: OutPt = null;
        let outPt2: OutPt = null;

        while (edge1 !== null) {
            //1. process maxima, treating them as if they're 'bent' horizontal edges,
            //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
            isMaximaEdge = edge1.getMaxima(topY);

            if (isMaximaEdge) {
                edge2 = edge1.maximaPair;
                isMaximaEdge = edge2 === null || !edge2.isHorizontal;
            }

            if (isMaximaEdge) {
                edge2 = edge1.PrevInAEL;
                this.DoMaxima(edge1);

                edge1 = edge2 === null ? this.m_ActiveEdges : edge2.NextInAEL;
            } else {
                //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
                if (edge1.getIntermediate(topY) && edge1.NextInLML.isHorizontal) {
                    edge1 = this.updateEdgeIntoAEL(edge1);

                    if (edge1.OutIdx >= 0) {
                        OutRec.addOutPt(this.m_PolyOuts, edge1, edge1.Bot);
                    }

                    this.m_SortedEdges = edge1.addEdgeToSEL(this.m_SortedEdges);
                } else {
                    edge1.Curr.set(edge1.topX(topY), topY);
                }

                if (this.StrictlySimple) {
                    edge2 = edge1.PrevInAEL;

                    if (
                        edge1.OutIdx >= 0 &&
                        edge1.WindDelta !== 0 &&
                        edge2 !== null &&
                        edge2.OutIdx >= 0 &&
                        edge2.Curr.x === edge1.Curr.x &&
                        edge2.WindDelta !== 0
                    ) {
                        outPt1 = OutRec.addOutPt(this.m_PolyOuts, edge2, edge1.Curr);
                        outPt2 = OutRec.addOutPt(this.m_PolyOuts, edge1, edge1.Curr);

                        this.joins.push(new Join(outPt1, outPt2, edge1.Curr));
                        //StrictlySimple (type-3) join
                    }
                }
                edge1 = edge1.NextInAEL;
            }
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.processHorizontals(true);
        //4. Promote intermediate vertices ...
        edge1 = this.m_ActiveEdges;

        while (edge1 !== null) {
            if (edge1.getIntermediate(topY)) {
                outPt1 = edge1.OutIdx >= 0 ? OutRec.addOutPt(this.m_PolyOuts, edge1, edge1.Top) : null;
                edge1 = this.updateEdgeIntoAEL(edge1);
                //if output polygons share an edge, they'll need joining later ...
                const ePrev: TEdge = edge1.PrevInAEL;
                const eNext: TEdge = edge1.NextInAEL;

                if (
                    ePrev !== null &&
                    ePrev.Curr.almostEqual(edge1.Bot) &&
                    outPt1 !== null &&
                    ePrev.OutIdx >= 0 &&
                    ePrev.Curr.y > ePrev.Top.y &&
                    TEdge.slopesEqual(edge1, ePrev, this.isUseFullRange) &&
                    edge1.WindDelta !== 0 &&
                    ePrev.WindDelta !== 0
                ) {
                    outPt2 = OutRec.addOutPt(this.m_PolyOuts, ePrev, edge1.Bot);
                    this.joins.push(new Join(outPt1, outPt2, edge1.Top));
                } else if (
                    eNext !== null &&
                    eNext.Curr.almostEqual(edge1.Bot) &&
                    outPt1 !== null &&
                    eNext.OutIdx >= 0 &&
                    eNext.Curr.y > eNext.Top.y &&
                    TEdge.slopesEqual(edge1, eNext, this.isUseFullRange) &&
                    edge1.WindDelta !== 0 &&
                    eNext.WindDelta !== 0
                ) {
                    outPt2 = OutRec.addOutPt(this.m_PolyOuts, eNext, edge1.Bot);
                    this.joins.push(new Join(outPt1, outPt2, edge1.Top));
                }
            }

            edge1 = edge1.NextInAEL;
        }
    }

    private DoMaxima(edge: TEdge): void {
        const maxPairEdge: TEdge | null = edge.maximaPair;

        if (maxPairEdge === null) {
            if (edge.OutIdx >= 0) {
                OutRec.addOutPt(this.m_PolyOuts, edge, edge.Top);
            }

            this.m_ActiveEdges = edge.deleteFromAEL(this.m_ActiveEdges);

            return;
        }

        let nextEdge: TEdge | null = edge.NextInAEL;

        while (nextEdge !== null && nextEdge !== maxPairEdge) {
            this.IntersectEdges(edge, nextEdge, edge.Top, true);
            this.SwapPositionsInAEL(edge, nextEdge);
            nextEdge = edge.NextInAEL;
        }

        if (edge.OutIdx === -1 && maxPairEdge.OutIdx === -1) {
            this.m_ActiveEdges = edge.deleteFromAEL(this.m_ActiveEdges);
            this.m_ActiveEdges = maxPairEdge.deleteFromAEL(this.m_ActiveEdges);
        } else if (edge.OutIdx >= 0 && maxPairEdge.OutIdx >= 0) {
            this.IntersectEdges(edge, maxPairEdge, edge.Top, false);
        } else if (edge.WindDelta === 0) {
            if (edge.OutIdx >= 0) {
                OutRec.addOutPt(this.m_PolyOuts, edge, edge.Top);
                edge.OutIdx = -1;
            }

            this.m_ActiveEdges = edge.deleteFromAEL(this.m_ActiveEdges);

            if (maxPairEdge.OutIdx >= 0) {
                OutRec.addOutPt(this.m_PolyOuts, maxPairEdge, edge.Top);
                maxPairEdge.OutIdx = -1;
            }

            this.m_ActiveEdges = maxPairEdge.deleteFromAEL(this.m_ActiveEdges);
        } else {
            showError('DoMaxima error');
        }
    }

    private insertLocalMinimaIntoAEL(botY: number): void {
        let leftBound: TEdge = null;
        let rightBound: TEdge = null;
        let outPt: OutPt = null;

        while (this.currentLM !== null && this.currentLM.Y === botY) {
            leftBound = this.currentLM.LeftBound;
            rightBound = this.currentLM.RightBound;
            outPt = null;

            if (this.currentLM !== null) {
                this.currentLM = this.currentLM.Next;
            }

            if (leftBound === null) {
                this.m_ActiveEdges = rightBound.insertEdgeIntoAEL(this.m_ActiveEdges);
                rightBound.setWindingCount(this.m_ActiveEdges, this.clipType, this.fillType);

                if (rightBound.getContributing(this.clipType, this.fillType)) {
                    outPt = OutRec.addOutPt(this.m_PolyOuts, rightBound, rightBound.Bot);
                }
            } else if (rightBound === null) {
                this.m_ActiveEdges = leftBound.insertEdgeIntoAEL(this.m_ActiveEdges);
                leftBound.setWindingCount(this.m_ActiveEdges, this.clipType, this.fillType);

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = OutRec.addOutPt(this.m_PolyOuts, leftBound, leftBound.Bot);
                }

                this.scanbeam = Scanbeam.insert(leftBound.Top.y, this.scanbeam);
            } else {
                this.m_ActiveEdges = leftBound.insertEdgeIntoAEL(this.m_ActiveEdges);
                this.m_ActiveEdges = rightBound.insertEdgeIntoAEL(this.m_ActiveEdges, leftBound);
                leftBound.setWindingCount(this.m_ActiveEdges, this.clipType, this.fillType);
                rightBound.WindCnt = leftBound.WindCnt;
                rightBound.WindCnt2 = leftBound.WindCnt2;

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.AddLocalMinPoly(leftBound, rightBound, leftBound.Bot);
                }

                this.scanbeam = Scanbeam.insert(leftBound.Top.y, this.scanbeam);
            }

            if (rightBound !== null) {
                if (rightBound.isHorizontal) {
                    this.m_SortedEdges = rightBound.addEdgeToSEL(this.m_SortedEdges);
                } else {
                    this.scanbeam = Scanbeam.insert(rightBound.Top.y, this.scanbeam);
                }
            }

            if (leftBound === null || rightBound === null) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            if (outPt !== null && rightBound.isHorizontal && this.ghostJoins.length > 0 && rightBound.WindDelta !== 0) {
                const joinCount: number = this.ghostJoins.length;
                let i: number = 0;
                let join: Join = null;

                for (i = 0; i < joinCount; ++i) {
                    //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                    //the 'ghost' join to a real join ready for later ...
                    join = this.ghostJoins[i];

                    if (Point.horzSegmentsOverlap(join.OutPt1.Pt, join.OffPt, rightBound.Bot, rightBound.Top)) {
                        this.joins.push(new Join(join.OutPt1, outPt, join.OffPt));
                    }
                }
            }

            if (
                leftBound.OutIdx >= 0 &&
                leftBound.PrevInAEL !== null &&
                leftBound.PrevInAEL.Curr.x === leftBound.Bot.x &&
                leftBound.PrevInAEL.OutIdx >= 0 &&
                TEdge.slopesEqual(leftBound.PrevInAEL, leftBound, this.isUseFullRange) &&
                leftBound.WindDelta !== 0 &&
                leftBound.PrevInAEL.WindDelta !== 0
            ) {
                const Op2: OutPt | null = OutRec.addOutPt(this.m_PolyOuts, leftBound.PrevInAEL, leftBound.Bot);
                this.joins.push(new Join(outPt, Op2, leftBound.Top));
            }

            if (leftBound.NextInAEL !== rightBound) {
                if (
                    rightBound.OutIdx >= 0 &&
                    rightBound.PrevInAEL.OutIdx >= 0 &&
                    TEdge.slopesEqual(rightBound.PrevInAEL, rightBound, this.isUseFullRange) &&
                    rightBound.WindDelta !== 0 &&
                    rightBound.PrevInAEL.WindDelta !== 0
                ) {
                    const Op2: OutPt | null = OutRec.addOutPt(this.m_PolyOuts, rightBound.PrevInAEL, rightBound.Bot);
                    this.joins.push(new Join(outPt, Op2, rightBound.Top));
                }

                let edge: TEdge | null = leftBound.NextInAEL;

                if (edge !== null)
                    while (edge !== rightBound) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.IntersectEdges(rightBound, edge, leftBound.Curr, false);
                        //order important here
                        edge = edge.NextInAEL;
                    }
            }
        }
    }

    private processIntersections(botY: number, topY: number): boolean {
        if (this.m_ActiveEdges === null) {
            return true;
        }

        try {
            this.buildIntersectList(botY, topY);

            if (this.m_IntersectList.length === 0) {
                return true;
            }

            if (this.m_IntersectList.length === 1 || this.fixupIntersectionOrder()) {
                this.processIntersectList();
            } else {
                return false;
            }
        } catch (error) {
            this.m_SortedEdges = null;
            this.m_IntersectList.length = 0;

            showError('ProcessIntersections error');
        }

        this.m_SortedEdges = null;

        return true;
    }

    private processIntersectList(): void {
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

    private IntersectEdges(edge1: TEdge, edge2: TEdge, point: Point, isProtect: boolean): void {
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
                    this.addLocalMaxPoly(edge1, edge2, point);
                }
            }
            //if intersecting a subj line with a subj poly ...
            else if (
                edge1.PolyTyp === edge2.PolyTyp &&
                edge1.WindDelta !== edge2.WindDelta &&
                this.clipType === ClipType.ctUnion
            ) {
                if (edge1.WindDelta === 0) {
                    if (edge2Contributing) {
                        OutRec.addOutPt(this.m_PolyOuts, edge1, point);

                        if (edge1Contributing) {
                            edge1.OutIdx = -1;
                        }
                    }
                } else {
                    if (edge1Contributing) {
                        OutRec.addOutPt(this.m_PolyOuts, edge2, point);

                        if (edge2Contributing) {
                            edge2.OutIdx = -1;
                        }
                    }
                }
            } else if (edge1.PolyTyp !== edge2.PolyTyp) {
                if (
                    edge1.WindDelta === 0 &&
                    Math.abs(edge2.WindCnt) === 1 &&
                    (this.clipType !== ClipType.ctUnion || edge2.WindCnt2 === 0)
                ) {
                    OutRec.addOutPt(this.m_PolyOuts, edge1, point);

                    if (edge1Contributing) {
                        edge1.OutIdx = -1;
                    }
                } else if (
                    edge2.WindDelta === 0 &&
                    Math.abs(edge1.WindCnt) === 1 &&
                    (this.clipType !== ClipType.ctUnion || edge1.WindCnt2 === 0)
                ) {
                    OutRec.addOutPt(this.m_PolyOuts, edge2, point);
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
            if (this.fillType === PolyFillType.pftEvenOdd) {
                const oldE1WindCnt: number = edge1.WindCnt;
                edge1.WindCnt = edge2.WindCnt;
                edge2.WindCnt = oldE1WindCnt;
            } else {
                if (edge1.WindCnt === -edge2.WindDelta) {
                    edge1.WindCnt = -edge1.WindCnt;
                } else {
                    edge1.WindCnt += edge2.WindDelta;
                }

                if (edge2.WindCnt === edge1.WindDelta) {
                    edge2.WindCnt = -edge2.WindCnt;
                } else {
                    edge2.WindCnt -= edge1.WindDelta;
                }
            }
        } else {
            if (this.fillType === PolyFillType.pftEvenOdd) {
                edge1.WindCnt2 = edge1.WindCnt2 === 0 ? 1 : 0;
                edge2.WindCnt2 = edge2.WindCnt2 === 0 ? 1 : 0;
            } else {
                edge1.WindCnt2 += edge2.WindDelta;
                edge2.WindCnt2 -= edge1.WindDelta;
            }
        }

        let e1Wc: number = 0;
        let e2Wc: number = 0;

        switch (this.fillType) {
            case PolyFillType.pftPositive:
                e1Wc = edge1.WindCnt;
                e2Wc = edge2.WindCnt;
                break;
            case PolyFillType.pftNegative:
                e1Wc = -edge1.WindCnt;
                e2Wc = -edge2.WindCnt;
                break;
            default:
                e1Wc = Math.abs(edge1.WindCnt);
                e2Wc = Math.abs(edge2.WindCnt);
                break;
        }

        if (edge1Contributing && edge2Contributing) {
            if (
                edge1Stops ||
                edge2Stops ||
                (e1Wc !== 0 && e1Wc !== 1) ||
                (e2Wc !== 0 && e2Wc !== 1) ||
                (edge1.PolyTyp !== edge2.PolyTyp && this.clipType !== ClipType.ctXor)
            ) {
                this.addLocalMaxPoly(edge1, edge2, point);
            } else {
                OutRec.addOutPt(this.m_PolyOuts, edge1, point);
                OutRec.addOutPt(this.m_PolyOuts, edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                OutRec.addOutPt(this.m_PolyOuts, edge1, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                OutRec.addOutPt(this.m_PolyOuts, edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            let e1Wc2: number = 0;
            let e2Wc2: number = 0;

            switch (this.fillType) {
                case PolyFillType.pftPositive:
                    e1Wc2 = edge1.WindCnt2;
                    e2Wc2 = edge2.WindCnt2;
                    break;
                case PolyFillType.pftNegative:
                    e1Wc2 = -edge1.WindCnt2;
                    e2Wc2 = -edge2.WindCnt2;
                    break;
                default:
                    e1Wc2 = Math.abs(edge1.WindCnt2);
                    e2Wc2 = Math.abs(edge2.WindCnt2);
                    break;
            }

            if (edge1.PolyTyp !== edge2.PolyTyp) {
                this.AddLocalMinPoly(edge1, edge2, point);
            } else if (e1Wc === 1 && e2Wc === 1) {
                switch (this.clipType) {
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

    private addLocalMaxPoly(e1: TEdge, e2: TEdge, pt: Point): void {
        OutRec.addOutPt(this.m_PolyOuts, e1, pt);

        if (e2.WindDelta === 0) {
            OutRec.addOutPt(this.m_PolyOuts, e2, pt);
        }

        if (e1.OutIdx === e2.OutIdx) {
            e1.OutIdx = -1;
            e2.OutIdx = -1;
        } else if (e1.OutIdx < e2.OutIdx) {
            OutRec.appendPolygon(this.m_PolyOuts, e1, e2, this.m_ActiveEdges);
        } else {
            OutRec.appendPolygon(this.m_PolyOuts, e2, e1, this.m_ActiveEdges);
        }
    }

    private AddLocalMinPoly(edge1: TEdge, edge2: TEdge, point: Point) {
        let result: OutPt = null;
        let edge: TEdge = null;
        let edgePrev: TEdge;

        if (edge2.isHorizontal || edge1.Dx > edge2.Dx) {
            result = OutRec.addOutPt(this.m_PolyOuts, edge1, point);
            edge2.OutIdx = edge1.OutIdx;
            edge1.Side = EdgeSide.esLeft;
            edge2.Side = EdgeSide.esRight;
            edge = edge1;
            edgePrev = edge.PrevInAEL === edge2 ? edge2.PrevInAEL : edge.PrevInAEL;
        } else {
            result = OutRec.addOutPt(this.m_PolyOuts, edge2, point);
            edge1.OutIdx = edge2.OutIdx;
            edge1.Side = EdgeSide.esRight;
            edge2.Side = EdgeSide.esLeft;
            edge = edge2;
            edgePrev = edge.PrevInAEL === edge1 ? edge1.PrevInAEL : edge.PrevInAEL;
        }

        if (
            edgePrev !== null &&
            edgePrev.OutIdx >= 0 &&
            edgePrev.topX(point.y) === edge.topX(point.y) &&
            TEdge.slopesEqual(edge, edgePrev, this.isUseFullRange) &&
            edge.WindDelta !== 0 &&
            edgePrev.WindDelta !== 0
        ) {
            const outPt: OutPt | null = OutRec.addOutPt(this.m_PolyOuts, edgePrev, point);
            this.joins.push(new Join(result, outPt, edge.Top));
        }

        return result;
    }

    private buildResult(polygons: Point[][]): void {
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

    protected reset(): void {
        super.reset();

        this.scanbeam = this.minimaList !== null ? this.minimaList.getScanbeam() : null;
        this.m_ActiveEdges = null;
        this.m_SortedEdges = null;
    }

    private popScanbeam(): number {
        const result: number = this.scanbeam.Y;

        this.scanbeam = this.scanbeam.Next;

        return result;
    }

    private disposeAllPolyPts(): void {
        const polyCount: number = this.m_PolyOuts.length;
        let outRec: OutRec = null;
        let i: number = 0;

        for (i = 0; i < polyCount; ++i) {
            outRec = this.m_PolyOuts[i];
            outRec.dispose();
        }

        this.m_PolyOuts = [];
    }

    private processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdge: TEdge = this.m_SortedEdges;

        while (horzEdge !== null) {
            this.m_SortedEdges = horzEdge.deleteFromSEL(this.m_SortedEdges);

            this.processHorizontal(horzEdge, isTopOfScanbeam);

            horzEdge = this.m_SortedEdges;
        }
    }

    private processHorizontal(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        let dirValue: Float64Array = horzEdge.horzDirection;
        let dir: Direction = dirValue[0] as Direction;
        let horzLeft: number = dirValue[1];
        let horzRight: number = dirValue[2];

        let eLastHorz: TEdge | null = horzEdge;
        let eMaxPair: TEdge | null = null;

        while (eLastHorz.NextInLML !== null && eLastHorz.NextInLML.isHorizontal) {
            eLastHorz = eLastHorz.NextInLML;
        }

        if (eLastHorz.NextInLML === null) {
            eMaxPair = eLastHorz.maximaPair;
        }

        while (true) {
            const isLastHorz: boolean = horzEdge === eLastHorz;
            let e: TEdge | null = horzEdge.getNextInAEL(dir);
            let eNext: TEdge | null = null;

            while (e !== null) {
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (e.Curr.x === horzEdge.Top.x && horzEdge.NextInLML !== null && e.Dx < horzEdge.NextInLML.Dx) {
                    break;
                }

                eNext = e.getNextInAEL(dir);
                //saves eNext for later
                if (
                    (dir === Direction.dLeftToRight && e.Curr.x <= horzRight) ||
                    (dir === Direction.dRightToLeft && e.Curr.x >= horzLeft)
                ) {
                    if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta !== 0) {
                        this.prepareHorzJoins(horzEdge, isTopOfScanbeam);
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
                    }

                    const Pt: Point = Point.create(e.Curr.x, horzEdge.Curr.y);

                    if (dir === Direction.dLeftToRight) {
                        this.IntersectEdges(horzEdge, e, Pt, true);
                    } else {
                        this.IntersectEdges(e, horzEdge, Pt, true);
                    }

                    this.SwapPositionsInAEL(horzEdge, e);
                } else if (
                    (dir === Direction.dLeftToRight && e.Curr.x >= horzRight) ||
                    (dir === Direction.dRightToLeft && e.Curr.x <= horzLeft)
                ) {
                    break;
                }

                e = eNext;
            }
            //end while
            if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta !== 0) {
                this.prepareHorzJoins(horzEdge, isTopOfScanbeam);
            }

            if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
                horzEdge = this.updateEdgeIntoAEL(horzEdge);

                if (horzEdge.OutIdx >= 0) {
                    OutRec.addOutPt(this.m_PolyOuts, horzEdge, horzEdge.Bot);
                }

                dirValue = horzEdge.horzDirection;
                dir = dirValue[0] as Direction;
                horzLeft = dirValue[1];
                horzRight = dirValue[2];
            } else {
                break;
            }
        }
        //end for (;;)
        if (horzEdge.NextInLML !== null) {
            if (horzEdge.OutIdx >= 0) {
                const op1: OutPt | null = OutRec.addOutPt(this.m_PolyOuts, horzEdge, horzEdge.Top);
                horzEdge = this.updateEdgeIntoAEL(horzEdge);

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
                    const op2: OutPt = OutRec.addOutPt(this.m_PolyOuts, ePrev, horzEdge.Bot);
                    this.joins.push(new Join(op1, op2, horzEdge.Top));
                } else if (
                    eNext !== null &&
                    eNext.Curr.x === horzEdge.Bot.x &&
                    eNext.Curr.y === horzEdge.Bot.y &&
                    eNext.WindDelta !== 0 &&
                    eNext.OutIdx >= 0 &&
                    eNext.Curr.y > eNext.Top.y &&
                    TEdge.slopesEqual(horzEdge, eNext, this.isUseFullRange)
                ) {
                    const op2: OutPt | null = OutRec.addOutPt(this.m_PolyOuts, eNext, horzEdge.Bot);
                    this.joins.push(new Join(op1, op2, horzEdge.Top));
                }
            } else {
                horzEdge = this.updateEdgeIntoAEL(horzEdge);
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
                OutRec.addOutPt(this.m_PolyOuts, horzEdge, horzEdge.Top);
            }
            this.m_ActiveEdges = horzEdge.deleteFromAEL(this.m_ActiveEdges);
        }
    }

    private prepareHorzJoins(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        if (isTopOfScanbeam) {
            //get the last Op for this horizontal edge
            //the point may be anywhere along the horizontal ...
            let outPt: OutPt | null = this.m_PolyOuts[horzEdge.OutIdx].Pts;
            if (horzEdge.Side !== EdgeSide.esLeft) {
                outPt = outPt.Prev;
            }

            const offPoint: Point = outPt.Pt.almostEqual(horzEdge.Top) ? horzEdge.Bot : horzEdge.Top;

            this.ghostJoins.push(new Join(outPt, null, offPoint));
        }
    }

    private updateEdgeIntoAEL(edge: TEdge): TEdge | null {
        if (edge.NextInLML === null) {
            showError('UpdateEdgeIntoAEL: invalid call');
        }

        const AelPrev: TEdge | null = edge.PrevInAEL;
        const AelNext: TEdge | null = edge.NextInAEL;
        edge.NextInLML.OutIdx = edge.OutIdx;

        if (AelPrev !== null) {
            AelPrev.NextInAEL = edge.NextInLML;
        } else {
            this.m_ActiveEdges = edge.NextInLML;
        }

        if (AelNext !== null) {
            AelNext.PrevInAEL = edge.NextInLML;
        }

        edge.NextInLML.Side = edge.Side;
        edge.NextInLML.WindDelta = edge.WindDelta;
        edge.NextInLML.WindCnt = edge.WindCnt;
        edge.NextInLML.WindCnt2 = edge.WindCnt2;
        edge = edge.NextInLML;
        edge.Curr.update(edge.Bot);
        edge.PrevInAEL = AelPrev;
        edge.NextInAEL = AelNext;

        if (!edge.isHorizontal) {
            this.scanbeam = Scanbeam.insert(edge.Top.y, this.scanbeam);
        }

        return edge;
    }

    private doSimplePolygons(): void {
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

    private fixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.m_IntersectList.sort(Clipper.IntersectNodeSort);

        this.copyAELToSEL();

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

    private copyAELToSEL(): void {
        let edge: TEdge = this.m_ActiveEdges;
        this.m_SortedEdges = edge;

        while (edge !== null) {
            edge = edge.copyAELToSEL();
        }
    }

    private buildIntersectList(botY: number, topY: number): void {
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
                        !TEdge.intersectPoint(edge, nextEdge, point, this.isUseFullRange) &&
                        edge.Curr.x > nextEdge.Curr.x + 1
                    ) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.set(Math.abs(edge.Dx) > Math.abs(nextEdge.Dx) ? nextEdge.topX(botY) : edge.topX(botY), botY);
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
    }

    private static IntersectNodeSort(node1: IntersectNode, node2: IntersectNode): number {
        //the following typecast is safe because the differences in Pt.Y will
        //be limited to the height of the scanbeam.
        return node2.Pt.y - node1.Pt.y;
    }
}
