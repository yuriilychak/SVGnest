import Point from '../point';
import ClipperBase from './clipper-base';
import { showError } from './helpers';
import IntersectNode from './intersect-node';
import Join from './join';
import OutPt from './out-pt';
import OutRec from './out-rec';
import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import { CLIP_TYPE, DIRECTION, NullPtr, POLY_FILL_TYPE, POLY_TYPE } from './types';

export default class Clipper extends ClipperBase {
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: NullPtr<Scanbeam> = null;
    private activeEdges: TEdge = null;
    private sortedEdges: TEdge = null;
    private intersections: IntersectNode[] = [];
    private isExecuteLocked: boolean = false;
    private polyOuts: OutRec[] = [];
    private joins: Join[] = [];
    private ghostJoins: Join[] = [];
    public ReverseSolution: boolean = false;
    public StrictlySimple: boolean = false;

    public execute(clipType: CLIP_TYPE, solution: Point[][], fillType: POLY_FILL_TYPE): boolean {
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
            outRecCount = this.polyOuts.length;

            for (i = 0; i < outRecCount; ++i) {
                outRec = this.polyOuts[i];

                if (outRec.isEmpty) {
                    continue;
                }

                if ((outRec.IsHole !== this.ReverseSolution) === outRec.area > 0) {
                    outRec.reversePts();
                }
            }

            const joinCount: number = this.joins.length;

            for (i = 0; i < joinCount; ++i) {
                this.joins[i].joinCommonEdges(this.polyOuts, this.isUseFullRange, this.ReverseSolution);
            }

            outRecCount = this.polyOuts.length;

            for (i = 0; i < outRecCount; ++i) {
                outRec = this.polyOuts[i];

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
        let edge1: TEdge = this.activeEdges;
        let edge2: NullPtr<TEdge> = null;
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

                edge1 = edge2 === null ? this.activeEdges : edge2.NextInAEL;
            } else {
                //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
                if (edge1.getIntermediate(topY) && edge1.NextInLML.isHorizontal) {
                    edge1 = this.updateEdgeIntoAEL(edge1);

                    if (edge1.isAssigned) {
                        OutRec.addOutPt(this.polyOuts, edge1, edge1.Bot);
                    }

                    this.sortedEdges = edge1.addEdgeToSEL(this.sortedEdges);
                } else {
                    edge1.Curr.set(edge1.topX(topY), topY);
                }

                if (this.StrictlySimple) {
                    edge2 = edge1.PrevInAEL;

                    if (edge1.isFilled && edge2 !== null && edge2.isFilled && edge2.Curr.x === edge1.Curr.x) {
                        outPt1 = OutRec.addOutPt(this.polyOuts, edge2, edge1.Curr);
                        outPt2 = OutRec.addOutPt(this.polyOuts, edge1, edge1.Curr);

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
        edge1 = this.activeEdges;

        while (edge1 !== null) {
            if (edge1.getIntermediate(topY)) {
                outPt1 = edge1.isAssigned ? OutRec.addOutPt(this.polyOuts, edge1, edge1.Top) : null;
                edge1 = this.updateEdgeIntoAEL(edge1);
                //if output polygons share an edge, they'll need joining later ...
                const ePrev: TEdge = edge1.PrevInAEL;
                const eNext: TEdge = edge1.NextInAEL;

                if (
                    outPt1 !== null &&
                    ePrev !== null &&
                    ePrev.Curr.almostEqual(edge1.Bot) &&
                    ePrev.isFilled &&
                    ePrev.Curr.y > ePrev.Top.y &&
                    TEdge.slopesEqual(edge1, ePrev, this.isUseFullRange) &&
                    !edge1.isWindDeletaEmpty
                ) {
                    outPt2 = OutRec.addOutPt(this.polyOuts, ePrev, edge1.Bot);
                    this.joins.push(new Join(outPt1, outPt2, edge1.Top));
                } else if (
                    outPt1 !== null &&
                    eNext !== null &&
                    eNext.Curr.almostEqual(edge1.Bot) &&
                    eNext.isFilled &&
                    eNext.Curr.y > eNext.Top.y &&
                    TEdge.slopesEqual(edge1, eNext, this.isUseFullRange) &&
                    !edge1.isWindDeletaEmpty
                ) {
                    outPt2 = OutRec.addOutPt(this.polyOuts, eNext, edge1.Bot);
                    this.joins.push(new Join(outPt1, outPt2, edge1.Top));
                }
            }

            edge1 = edge1.NextInAEL;
        }
    }

    private DoMaxima(edge: TEdge): void {
        const maxPairEdge: NullPtr<TEdge> = edge.maximaPair;

        if (maxPairEdge === null) {
            if (edge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, edge, edge.Top);
            }

            this.activeEdges = edge.deleteFromAEL(this.activeEdges);

            return;
        }

        let nextEdge: NullPtr<TEdge> = edge.NextInAEL;

        while (nextEdge !== null && nextEdge !== maxPairEdge) {
            this.intersectEdges(edge, nextEdge, edge.Top, true);
            this.SwapPositionsInAEL(edge, nextEdge);
            nextEdge = edge.NextInAEL;
        }

        if (!edge.isAssigned && !maxPairEdge.isAssigned) {
            this.activeEdges = edge.deleteFromAEL(this.activeEdges);
            this.activeEdges = maxPairEdge.deleteFromAEL(this.activeEdges);
        } else if (edge.isAssigned && maxPairEdge.isAssigned) {
            this.intersectEdges(edge, maxPairEdge, edge.Top, false);
        } else if (edge.isWindDeletaEmpty) {
            if (edge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, edge, edge.Top);
                edge.unassign();
            }

            this.activeEdges = edge.deleteFromAEL(this.activeEdges);

            if (maxPairEdge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, maxPairEdge, edge.Top);
                maxPairEdge.unassign();
            }

            this.activeEdges = maxPairEdge.deleteFromAEL(this.activeEdges);
        } else {
            showError('DoMaxima error');
        }
    }

    private insertLocalMinimaIntoAEL(botY: number): void {
        let leftBound: TEdge = null;
        let rightBound: TEdge = null;
        let outPt: OutPt = null;

        while (this.currentLM !== null && this.currentLM.y === botY) {
            leftBound = this.currentLM.leftBound;
            rightBound = this.currentLM.rightBound;
            outPt = null;

            if (this.currentLM !== null) {
                this.currentLM = this.currentLM.next;
            }

            if (leftBound === null) {
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges);
                rightBound.setWindingCount(this.activeEdges, this.clipType);

                if (rightBound.getContributing(this.clipType, this.fillType)) {
                    outPt = OutRec.addOutPt(this.polyOuts, rightBound, rightBound.Bot);
                }
            } else if (rightBound === null) {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                leftBound.setWindingCount(this.activeEdges, this.clipType);

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = OutRec.addOutPt(this.polyOuts, leftBound, leftBound.Bot);
                }

                this.scanbeam = Scanbeam.insert(leftBound.Top.y, this.scanbeam);
            } else {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges, leftBound);
                leftBound.setWindingCount(this.activeEdges, this.clipType);
                rightBound.WindCnt = leftBound.WindCnt;
                rightBound.WindCnt2 = leftBound.WindCnt2;

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.AddLocalMinPoly(leftBound, rightBound, leftBound.Bot);
                }

                this.scanbeam = Scanbeam.insert(leftBound.Top.y, this.scanbeam);
            }

            if (rightBound !== null) {
                if (rightBound.isHorizontal) {
                    this.sortedEdges = rightBound.addEdgeToSEL(this.sortedEdges);
                } else {
                    this.scanbeam = Scanbeam.insert(rightBound.Top.y, this.scanbeam);
                }
            }

            if (leftBound === null || rightBound === null) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            if (outPt !== null && rightBound.isHorizontal && this.ghostJoins.length > 0 && !rightBound.isWindDeletaEmpty) {
                const joinCount: number = this.ghostJoins.length;
                let i: number = 0;
                let join: Join = null;

                for (i = 0; i < joinCount; ++i) {
                    //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                    //the 'ghost' join to a real join ready for later ...
                    join = this.ghostJoins[i];

                    if (Point.horzSegmentsOverlap(join.OutPt1.point, join.OffPt, rightBound.Bot, rightBound.Top)) {
                        this.joins.push(new Join(join.OutPt1, outPt, join.OffPt));
                    }
                }
            }

            if (
                leftBound.isFilled &&
                leftBound.PrevInAEL !== null &&
                leftBound.PrevInAEL.Curr.x === leftBound.Bot.x &&
                leftBound.PrevInAEL.isFilled &&
                TEdge.slopesEqual(leftBound.PrevInAEL, leftBound, this.isUseFullRange)
            ) {
                const Op2: NullPtr<OutPt> = OutRec.addOutPt(this.polyOuts, leftBound.PrevInAEL, leftBound.Bot);
                this.joins.push(new Join(outPt, Op2, leftBound.Top));
            }

            if (leftBound.NextInAEL !== rightBound) {
                if (
                    rightBound.isFilled &&
                    rightBound.PrevInAEL.isFilled &&
                    TEdge.slopesEqual(rightBound.PrevInAEL, rightBound, this.isUseFullRange)
                ) {
                    const Op2: NullPtr<OutPt> = OutRec.addOutPt(this.polyOuts, rightBound.PrevInAEL, rightBound.Bot);
                    this.joins.push(new Join(outPt, Op2, rightBound.Top));
                }

                let edge: NullPtr<TEdge> = leftBound.NextInAEL;

                if (edge !== null)
                    while (edge !== rightBound) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.intersectEdges(rightBound, edge, leftBound.Curr, false);
                        //order important here
                        edge = edge.NextInAEL;
                    }
            }
        }
    }

    private processIntersections(botY: number, topY: number): boolean {
        if (this.activeEdges === null) {
            return true;
        }

        try {
            this.buildIntersectList(botY, topY);

            if (this.intersections.length === 0) {
                return true;
            }

            if (this.intersections.length === 1 || this.fixupIntersectionOrder()) {
                this.processIntersectList();
            } else {
                return false;
            }
        } catch (error) {
            this.sortedEdges = null;
            this.intersections.length = 0;

            showError('ProcessIntersections error');
        }

        this.sortedEdges = null;

        return true;
    }

    private processIntersectList(): void {
        const intersectCount: number = this.intersections.length;
        let i: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            node = this.intersections[i];
            this.intersectEdges(node.Edge1, node.Edge2, node.Pt, true);
            this.SwapPositionsInAEL(node.Edge1, node.Edge2);
        }

        this.intersections = [];
    }

    private intersectEdges(edge1: TEdge, edge2: TEdge, point: Point, isProtect: boolean): void {
        //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
        //e2 in AEL except when e1 is being inserted at the intersection point ...
        let edge1Stops: boolean = !isProtect && edge1.NextInLML === null && edge1.Top.almostEqual(point);
        let edge2Stops: boolean = !isProtect && edge2.NextInLML === null && edge2.Top.almostEqual(point);
        let edge1Contributing: boolean = edge1.isAssigned;
        let edge2Contributing: boolean = edge2.isAssigned;

        //if either edge is on an OPEN path ...
        if (edge1.isWindDeletaEmpty || edge2.isWindDeletaEmpty) {
            //ignore subject-subject open path intersections UNLESS they
            //are both open paths, AND they are both 'contributing maximas' ...
            if (edge1.isWindDeletaEmpty && edge2.isWindDeletaEmpty) {
                if ((edge1Stops || edge2Stops) && edge1Contributing && edge2Contributing) {
                    OutRec.addLocalMaxPoly(this.polyOuts, edge1, edge2, point, this.activeEdges);
                }
            }
            //if intersecting a subj line with a subj poly ...
            else if (
                edge1.PolyTyp === edge2.PolyTyp &&
                edge1.WindDelta !== edge2.WindDelta &&
                this.clipType === CLIP_TYPE.UNION
            ) {
                if (edge1.isWindDeletaEmpty) {
                    if (edge2Contributing) {
                        OutRec.addOutPt(this.polyOuts, edge1, point);

                        if (edge1Contributing) {
                            edge1.unassign();
                        }
                    }
                } else {
                    if (edge1Contributing) {
                        OutRec.addOutPt(this.polyOuts, edge2, point);

                        if (edge2Contributing) {
                            edge2.unassign();
                        }
                    }
                }
            } else if (edge1.PolyTyp !== edge2.PolyTyp) {
                if (
                    edge1.isWindDeletaEmpty &&
                    Math.abs(edge2.WindCnt) === 1 &&
                    (this.clipType !== CLIP_TYPE.UNION || edge2.WindCnt2 === 0)
                ) {
                    OutRec.addOutPt(this.polyOuts, edge1, point);

                    if (edge1Contributing) {
                        edge1.unassign();
                    }
                } else if (
                    edge2.isWindDeletaEmpty &&
                    Math.abs(edge1.WindCnt) === 1 &&
                    (this.clipType !== CLIP_TYPE.UNION || edge1.WindCnt2 === 0)
                ) {
                    OutRec.addOutPt(this.polyOuts, edge2, point);

                    if (edge2Contributing) {
                        edge2.unassign();
                    }
                }
            }

            if (edge1Stops) {
                if (!edge1.isAssigned) {
                    this.activeEdges = edge1.deleteFromAEL(this.activeEdges);
                } else {
                    showError('Error intersecting polylines');
                }
            }

            if (edge2Stops) {
                if (!edge2.isAssigned) {
                    this.activeEdges = edge2.deleteFromAEL(this.activeEdges);
                } else {
                    showError('Error intersecting polylines');
                }
            }

            return;
        }

        //update winding counts...
        //assumes that e1 will be to the Right of e2 ABOVE the intersection
        if (edge1.PolyTyp === edge2.PolyTyp) {
            edge1.WindCnt = edge1.WindCnt === -edge2.WindDelta ? -edge1.WindCnt : edge1.WindCnt + edge2.WindDelta;
            edge2.WindCnt = edge2.WindCnt === edge1.WindDelta ? -edge2.WindCnt : edge2.WindCnt - edge1.WindDelta;
        } else {
            edge1.WindCnt2 += edge2.WindDelta;
            edge2.WindCnt2 -= edge1.WindDelta;
        }

        let e1Wc: number = 0;
        let e2Wc: number = 0;

        switch (this.fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                e1Wc = edge1.WindCnt;
                e2Wc = edge2.WindCnt;
                break;
            case POLY_FILL_TYPE.NEGATIVE:
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
                edge1.PolyTyp !== edge2.PolyTyp
            ) {
                OutRec.addLocalMaxPoly(this.polyOuts, edge1, edge2, point, this.activeEdges);
            } else {
                OutRec.addOutPt(this.polyOuts, edge1, point);
                OutRec.addOutPt(this.polyOuts, edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                OutRec.addOutPt(this.polyOuts, edge1, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                OutRec.addOutPt(this.polyOuts, edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
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
                this.AddLocalMinPoly(edge1, edge2, point);
            } else if (e1Wc === 1 && e2Wc === 1) {
                switch (this.clipType) {
                    case CLIP_TYPE.UNION:
                        if (e1Wc2 <= 0 && e2Wc2 <= 0) {
                            this.AddLocalMinPoly(edge1, edge2, point);
                        }
                        break;
                    case CLIP_TYPE.DIFFERENCE:
                        if (
                            (edge1.PolyTyp === POLY_TYPE.CLIP && Math.min(e1Wc2, e2Wc2) > 0) ||
                            (edge1.PolyTyp === POLY_TYPE.SUBJECT && Math.max(e1Wc2, e2Wc2) <= 0)
                        ) {
                            this.AddLocalMinPoly(edge1, edge2, point);
                        }
                        break;
                }
            } else {
                TEdge.swapSides(edge1, edge2);
            }
        }
        if (edge1Stops !== edge2Stops && ((edge1Stops && edge1.isAssigned) || (edge2Stops && edge2.isAssigned))) {
            TEdge.swapSides(edge1, edge2);
            TEdge.swapPolyIndexes(edge1, edge2);
        }
        //finally, delete any non-contributing maxima edges  ...
        if (edge1Stops) {
            this.activeEdges = edge1.deleteFromAEL(this.activeEdges);
        }

        if (edge2Stops) {
            this.activeEdges = edge2.deleteFromAEL(this.activeEdges);
        }
    }

    private AddLocalMinPoly(edge1: TEdge, edge2: TEdge, point: Point) {
        let result: OutPt = null;
        let edge: TEdge = null;
        let edgePrev: TEdge;

        if (edge2.isHorizontal || edge1.Dx > edge2.Dx) {
            result = OutRec.addOutPt(this.polyOuts, edge1, point);
            edge2.index = edge1.index;
            edge2.Side = DIRECTION.RIGHT;
            edge1.Side = DIRECTION.LEFT;
            edge = edge1;
            edgePrev = edge.PrevInAEL === edge2 ? edge2.PrevInAEL : edge.PrevInAEL;
        } else {
            result = OutRec.addOutPt(this.polyOuts, edge2, point);
            edge1.index = edge2.index;
            edge1.Side = DIRECTION.RIGHT;
            edge2.Side = DIRECTION.LEFT;
            edge = edge2;
            edgePrev = edge.PrevInAEL === edge1 ? edge1.PrevInAEL : edge.PrevInAEL;
        }

        if (
            edgePrev !== null &&
            edgePrev.isFilled &&
            edgePrev.topX(point.y) === edge.topX(point.y) &&
            TEdge.slopesEqual(edge, edgePrev, this.isUseFullRange) &&
            !edge.isWindDeletaEmpty
        ) {
            const outPt: NullPtr<OutPt> = OutRec.addOutPt(this.polyOuts, edgePrev, point);
            this.joins.push(new Join(result, outPt, edge.Top));
        }

        return result;
    }

    private buildResult(polygons: Point[][]): void {
        const polygonCount = this.polyOuts.length;
        let outRec: OutRec = null;
        let polygon: NullPtr<Point[]> = null;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            outRec = this.polyOuts[i];
            polygon = outRec.export();

            if (polygon !== null) {
                polygons.push(polygon);
            }
        }
    }

    protected reset(): void {
        super.reset();

        this.scanbeam = this.minimaList !== null ? this.minimaList.getScanbeam() : null;
        this.activeEdges = null;
        this.sortedEdges = null;
    }

    private popScanbeam(): number {
        const result: number = this.scanbeam.Y;

        this.scanbeam = this.scanbeam.Next;

        return result;
    }

    private disposeAllPolyPts(): void {
        const polyCount: number = this.polyOuts.length;
        let outRec: OutRec = null;
        let i: number = 0;

        for (i = 0; i < polyCount; ++i) {
            outRec = this.polyOuts[i];
            outRec.dispose();
        }

        this.polyOuts = [];
    }

    private processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdge: TEdge = this.sortedEdges;

        while (horzEdge !== null) {
            this.sortedEdges = horzEdge.deleteFromSEL(this.sortedEdges);

            this.processHorizontal(horzEdge, isTopOfScanbeam);

            horzEdge = this.sortedEdges;
        }
    }

    private processHorizontal(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        let dirValue: Float64Array = horzEdge.horzDirection;
        let dir: DIRECTION = dirValue[0] as DIRECTION;
        let horzLeft: number = dirValue[1];
        let horzRight: number = dirValue[2];

        let eLastHorz: NullPtr<TEdge> = horzEdge;
        let eMaxPair: NullPtr<TEdge> = null;

        while (eLastHorz.NextInLML !== null && eLastHorz.NextInLML.isHorizontal) {
            eLastHorz = eLastHorz.NextInLML;
        }

        if (eLastHorz.NextInLML === null) {
            eMaxPair = eLastHorz.maximaPair;
        }

        while (true) {
            const isLastHorz: boolean = horzEdge === eLastHorz;
            let e: NullPtr<TEdge> = horzEdge.getNextInAEL(dir);
            let eNext: NullPtr<TEdge> = null;

            while (e !== null) {
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (e.Curr.x === horzEdge.Top.x && horzEdge.NextInLML !== null && e.Dx < horzEdge.NextInLML.Dx) {
                    break;
                }

                eNext = e.getNextInAEL(dir);
                //saves eNext for later
                if ((dir === DIRECTION.RIGHT && e.Curr.x <= horzRight) || (dir === DIRECTION.LEFT && e.Curr.x >= horzLeft)) {
                    if (horzEdge.isFilled) {
                        this.prepareHorzJoins(horzEdge, isTopOfScanbeam);
                    }

                    //so far we're still in range of the horizontal Edge  but make sure
                    //we're at the last of consec. horizontals when matching with eMaxPair
                    if (e === eMaxPair && isLastHorz) {
                        if (dir === DIRECTION.RIGHT) {
                            this.intersectEdges(horzEdge, e, e.Top, false);
                        } else {
                            this.intersectEdges(e, horzEdge, e.Top, false);
                        }
                        if (eMaxPair.isAssigned) {
                            showError('ProcessHorizontal error');
                        }

                        return;
                    }

                    const Pt: Point = Point.create(e.Curr.x, horzEdge.Curr.y);

                    if (dir === DIRECTION.RIGHT) {
                        this.intersectEdges(horzEdge, e, Pt, true);
                    } else {
                        this.intersectEdges(e, horzEdge, Pt, true);
                    }

                    this.SwapPositionsInAEL(horzEdge, e);
                } else if (
                    (dir === DIRECTION.RIGHT && e.Curr.x >= horzRight) ||
                    (dir === DIRECTION.LEFT && e.Curr.x <= horzLeft)
                ) {
                    break;
                }

                e = eNext;
            }
            //end while
            if (horzEdge.isFilled) {
                this.prepareHorzJoins(horzEdge, isTopOfScanbeam);
            }

            if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
                horzEdge = this.updateEdgeIntoAEL(horzEdge);

                if (horzEdge.isAssigned) {
                    OutRec.addOutPt(this.polyOuts, horzEdge, horzEdge.Bot);
                }

                dirValue = horzEdge.horzDirection;
                dir = dirValue[0] as DIRECTION;
                horzLeft = dirValue[1];
                horzRight = dirValue[2];
            } else {
                break;
            }
        }
        //end for (;;)
        if (horzEdge.NextInLML !== null) {
            if (horzEdge.isAssigned) {
                const op1: NullPtr<OutPt> = OutRec.addOutPt(this.polyOuts, horzEdge, horzEdge.Top);
                horzEdge = this.updateEdgeIntoAEL(horzEdge);

                if (horzEdge.isWindDeletaEmpty) {
                    return;
                }
                //nb: HorzEdge is no longer horizontal here
                let prevEdge: NullPtr<TEdge> = horzEdge.PrevInAEL;
                let nextEdge: NullPtr<TEdge> = horzEdge.NextInAEL;

                if (
                    prevEdge !== null &&
                    prevEdge.Curr.almostEqual(horzEdge.Bot) &&
                    prevEdge.isFilled &&
                    prevEdge.Curr.y > prevEdge.Top.y &&
                    TEdge.slopesEqual(horzEdge, prevEdge, this.isUseFullRange)
                ) {
                    const op2: OutPt = OutRec.addOutPt(this.polyOuts, prevEdge, horzEdge.Bot);
                    this.joins.push(new Join(op1, op2, horzEdge.Top));
                } else if (
                    nextEdge !== null &&
                    nextEdge.Curr.almostEqual(horzEdge.Bot) &&
                    nextEdge.isFilled &&
                    nextEdge.Curr.y > nextEdge.Top.y &&
                    TEdge.slopesEqual(horzEdge, nextEdge, this.isUseFullRange)
                ) {
                    const op2: NullPtr<OutPt> = OutRec.addOutPt(this.polyOuts, nextEdge, horzEdge.Bot);
                    this.joins.push(new Join(op1, op2, horzEdge.Top));
                }
            } else {
                horzEdge = this.updateEdgeIntoAEL(horzEdge);
            }
        } else if (eMaxPair !== null) {
            if (eMaxPair.isAssigned) {
                if (dir === DIRECTION.RIGHT) {
                    this.intersectEdges(horzEdge, eMaxPair, horzEdge.Top, false);
                } else {
                    this.intersectEdges(eMaxPair, horzEdge, horzEdge.Top, false);
                }
                if (eMaxPair.isAssigned) {
                    showError('ProcessHorizontal error');
                }
            } else {
                this.activeEdges = horzEdge.deleteFromAEL(this.activeEdges);
                this.activeEdges = eMaxPair.deleteFromAEL(this.activeEdges);
            }
        } else {
            if (horzEdge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, horzEdge, horzEdge.Top);
            }

            this.activeEdges = horzEdge.deleteFromAEL(this.activeEdges);
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
            let outPt: NullPtr<OutPt> = this.polyOuts[horzEdge.index].Pts;

            if (horzEdge.Side === DIRECTION.RIGHT) {
                outPt = outPt.prev;
            }

            const offPoint: Point = outPt.point.almostEqual(horzEdge.Top) ? horzEdge.Bot : horzEdge.Top;

            this.ghostJoins.push(new Join(outPt, null, offPoint));
        }
    }

    private updateEdgeIntoAEL(edge: TEdge): NullPtr<TEdge> {
        if (edge.NextInLML === null) {
            showError('UpdateEdgeIntoAEL: invalid call');
        }

        const AelPrev: NullPtr<TEdge> = edge.PrevInAEL;
        const AelNext: NullPtr<TEdge> = edge.NextInAEL;
        edge.NextInLML.index = edge.index;

        if (AelPrev !== null) {
            AelPrev.NextInAEL = edge.NextInLML;
        } else {
            this.activeEdges = edge.NextInLML;
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

        while (i < this.polyOuts.length) {
            outRec = this.polyOuts[i++];
            outPt = outRec.Pts;

            if (outPt !== null) {
                outRec.simplify(outPt, this.polyOuts);
            }
        }
    }

    private fixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.intersections.sort(IntersectNode.sort);

        this.copyAELToSEL();

        const intersectCount: number = this.intersections.length;
        let i: number = 0;
        let j: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            if (!this.intersections[i].edgesAdjacent) {
                j = i + 1;

                while (j < intersectCount && !this.intersections[j].edgesAdjacent) {
                    ++j;
                }

                if (j === intersectCount) {
                    return false;
                }

                node = this.intersections[i];
                this.intersections[i] = this.intersections[j];
                this.intersections[j] = node;
            }

            this.SwapPositionsInSEL(this.intersections[i].Edge1, this.intersections[i].Edge2);
        }

        return true;
    }

    private SwapPositionsInAEL(edge1: TEdge, edge2: TEdge): void {
        if (!TEdge.swapPositionsInAEL(edge1, edge2)) {
            return;
        }

        if (edge1.PrevInAEL === null) {
            this.activeEdges = edge1;
        } else if (edge2.PrevInAEL === null) {
            this.activeEdges = edge2;
        }
    }

    private SwapPositionsInSEL(edge1: TEdge, edge2: TEdge) {
        if (!TEdge.swapPositionsInSEL(edge1, edge2)) {
            return;
        }

        if (edge1.PrevInSEL === null) {
            this.sortedEdges = edge1;
        } else if (edge2.PrevInSEL === null) {
            this.sortedEdges = edge2;
        }
    }

    private copyAELToSEL(): void {
        let edge: TEdge = this.activeEdges;
        this.sortedEdges = edge;

        while (edge !== null) {
            edge = edge.copyAELToSEL();
        }
    }

    private buildIntersectList(botY: number, topY: number): void {
        if (this.activeEdges === null) {
            return;
        }
        //prepare for sorting ...
        let edge: TEdge = this.activeEdges;
        //console.log(JSON.stringify(JSON.decycle( e )));
        this.sortedEdges = edge;

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

        while (isModified && this.sortedEdges !== null) {
            isModified = false;
            edge = this.sortedEdges;

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

                    this.intersections.push(new IntersectNode(edge, nextEdge, point));
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

        this.sortedEdges = null;
    }
}
