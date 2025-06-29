import { PointI32 } from '../geometry';
import { showError } from './helpers';
import IntersectNode from './intersect-node';
import JoinManager from './join-manager';
import LocalMinimaManager from './local-minima-manager';
import OutPt from './out-pt';
import OutRec from './out-rec';
import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import TEdgeManager from './t-edge-manager';
import { CLIP_TYPE, DIRECTION, NullPtr, POLY_FILL_TYPE, POLY_TYPE } from './types';

export default class Clipper {
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: Scanbeam = new Scanbeam();
    private tEdgeManager: TEdgeManager = new TEdgeManager();
    private isExecuteLocked: boolean = false;
    private polyOuts: OutRec[] = [];
    private joinManager: JoinManager = new JoinManager();
    private isUseFullRange: boolean = false;
    private localMinimaManager: LocalMinimaManager = new LocalMinimaManager();
    public ReverseSolution: boolean = false;
    public StrictlySimple: boolean = false;

    public addPath(polygon: PointI32[], polyType: POLY_TYPE): boolean {
        let lastIndex = polygon.length - 1;

        while (
            lastIndex > 0 &&
            (polygon[lastIndex].almostEqual(polygon[0]) || polygon[lastIndex].almostEqual(polygon[lastIndex - 1]))
        ) {
            --lastIndex;
        }

        if (lastIndex < 2) {
            return false;
        }
        //create a new edge array ...
        const edges: TEdge[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            edges.push(new TEdge());
        }

        //1. Basic (first) edge initialization ...

        //edges[1].Curr = pg[1];
        edges[1].Curr.update(polygon[1]);

        this.isUseFullRange = polygon[0].rangeTest(this.isUseFullRange);
        this.isUseFullRange = polygon[lastIndex].rangeTest(this.isUseFullRange);

        edges[0].init(edges[1], edges[lastIndex], polygon[0]);
        edges[lastIndex].init(edges[0], edges[lastIndex - 1], polygon[lastIndex]);

        for (i = lastIndex - 1; i >= 1; --i) {
            this.isUseFullRange = polygon[i].rangeTest(this.isUseFullRange);

            edges[i].init(edges[i + 1], edges[i - 1], polygon[i]);
        }

        let startEdge: TEdge = edges[0];
        //2. Remove duplicate vertices, and (when closed) collinear edges ...
        let edge: TEdge = startEdge;
        let loopStopEdge: TEdge = startEdge;

        while (true) {
            if (edge.Curr.almostEqual(edge.Next.Curr)) {
                if (edge === edge.Next) {
                    break;
                }

                if (edge === startEdge) {
                    startEdge = edge.Next;
                }

                edge = edge.remove();
                loopStopEdge = edge;

                continue;
            }

            if (edge.Prev === edge.Next) {
                break;
            }

            if (PointI32.slopesEqual(edge.Prev.Curr, edge.Curr, edge.Next.Curr, this.isUseFullRange)) {
                //Collinear edges are allowed for open paths but in closed paths
                //the default is to merge adjacent collinear edges into a single edge.
                //However, if the PreserveCollinear property is enabled, only overlapping
                //collinear edges (ie spikes) will be removed from closed paths.
                if (edge === startEdge) {
                    startEdge = edge.Next;
                }

                edge = edge.remove();
                edge = edge.Prev;
                loopStopEdge = edge;

                continue;
            }

            edge = edge.Next;

            if (edge === loopStopEdge) {
                break;
            }
        }

        if (edge.Prev === edge.Next) {
            return false;
        }

        //3. Do second stage of edge initialization ...
        edge = startEdge;

        let isFlat: boolean = true;

        do {
            edge.initFromPolyType(polyType);
            edge = edge.Next;

            if (isFlat && edge.Curr.y !== startEdge.Curr.y) {
                isFlat = false;
            }
        } while (edge !== startEdge);
        //4. Finally, add edge bounds to LocalMinima list ...
        //Totally flat paths must be handled differently when adding them
        //to LocalMinima list to avoid endless loops etc ...
        if (isFlat) {
            return false;
        }

        this.localMinimaManager.addEdgeBounds(edge);

        return true;
    }

    public addPaths(polygons: PointI32[][], polyType: POLY_TYPE): boolean {
        //  console.log("-------------------------------------------");
        //  console.log(JSON.stringify(ppg));
        const polygonCount: number = polygons.length;
        let result: boolean = false;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            if (this.addPath(polygons[i], polyType)) {
                result = true;
            }
        }

        return result;
    }

    public execute(clipType: CLIP_TYPE, solution: PointI32[][], fillType: POLY_FILL_TYPE): boolean {
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

            if (this.localMinimaManager.isEmpty) {
                return false;
            }

            let i: number = 0;
            let outRec: OutRec = null;
            let outRecCount: number = 0;
            let botY: number = this.scanbeam.pop();
            let topY: number = 0;

            do {
                this.insertLocalMinimaIntoAEL(botY);
                this.joinManager.clearGhostJoins();
                this.processHorizontals(false);

                if (this.scanbeam.isEmpty) {
                    break;
                }

                topY = this.scanbeam.pop();
                //console.log("botY:" + botY + ", topY:" + topY);
                if (!this.processIntersections(botY, topY)) {
                    return false;
                }

                this.processEdgesAtTopOfScanbeam(topY);

                botY = topY;
            } while (!this.scanbeam.isEmpty || !this.localMinimaManager.isEmpty);
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

            this.joinManager.joinCommonEdges(this.polyOuts, this.isUseFullRange, this.ReverseSolution);

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
            this.joinManager.reset();
        }
    }

    private processEdgesAtTopOfScanbeam(topY: number): void {
        let edge1: TEdge = this.tEdgeManager.activeEdges;
        let edge2: NullPtr<TEdge> = null;
        let isMaximaEdge: boolean = false;
        let outPt1: OutPt = null;

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

                edge1 = edge2 === null ? this.tEdgeManager.activeEdges : edge2.NextInAEL;
            } else {
                //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
                if (edge1.getIntermediate(topY) && edge1.NextInLML.isHorizontal) {
                    edge1 = this.tEdgeManager.updateEdgeIntoAEL(edge1, this.scanbeam);

                    if (edge1.isAssigned) {
                        OutRec.addOutPt(this.polyOuts, edge1, edge1.Bot);
                    }

                    this.tEdgeManager.sortedEdges = edge1.addEdgeToSEL(this.tEdgeManager.sortedEdges);
                } else {
                    edge1.Curr.set(edge1.topX(topY), topY);
                }

                if (this.StrictlySimple) {
                    edge2 = edge1.PrevInAEL;

                    this.joinManager.addScanbeamJoin(edge1, edge2, this.polyOuts);
                }
                edge1 = edge1.NextInAEL;
            }
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.processHorizontals(true);
        //4. Promote intermediate vertices ...
        edge1 = this.tEdgeManager.activeEdges;

        while (edge1 !== null) {
            if (edge1.getIntermediate(topY)) {
                outPt1 = edge1.isAssigned ? OutRec.addOutPt(this.polyOuts, edge1, edge1.Top) : null;
                edge1 = this.tEdgeManager.updateEdgeIntoAEL(edge1, this.scanbeam);
                //if output polygons share an edge, they'll need joining later...
                this.joinManager.addSharedJoin(outPt1, edge1, this.polyOuts, this.isUseFullRange);
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

            this.tEdgeManager.activeEdges = edge.deleteFromAEL(this.tEdgeManager.activeEdges);

            return;
        }

        let nextEdge: NullPtr<TEdge> = edge.NextInAEL;

        while (nextEdge !== null && nextEdge !== maxPairEdge) {
            this.intersectEdges(edge, nextEdge, edge.Top, true);
            this.tEdgeManager.swapPositionsInAEL(edge, nextEdge);
            nextEdge = edge.NextInAEL;
        }

        if (!edge.isAssigned && !maxPairEdge.isAssigned) {
            this.tEdgeManager.activeEdges = edge.deleteFromAEL(this.tEdgeManager.activeEdges);
            this.tEdgeManager.activeEdges = maxPairEdge.deleteFromAEL(this.tEdgeManager.activeEdges);
        } else if (edge.isAssigned && maxPairEdge.isAssigned) {
            this.intersectEdges(edge, maxPairEdge, edge.Top, false);
        } else if (edge.isWindDeletaEmpty) {
            if (edge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, edge, edge.Top);
                edge.unassign();
            }

            this.tEdgeManager.activeEdges = edge.deleteFromAEL(this.tEdgeManager.activeEdges);

            if (maxPairEdge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, maxPairEdge, edge.Top);
                maxPairEdge.unassign();
            }

            this.tEdgeManager.activeEdges = maxPairEdge.deleteFromAEL(this.tEdgeManager.activeEdges);
        } else {
            showError('DoMaxima error');
        }
    }

    private insertLocalMinimaIntoAEL(botY: number): void {
        let outPt: OutPt = null;

        while (!Number.isNaN(this.localMinimaManager.y) && this.localMinimaManager.y === botY) {
            let [leftBound, rightBound] = this.localMinimaManager.pop();
            outPt = null;

            if (leftBound === null) {
                this.tEdgeManager.activeEdges = rightBound.insertEdgeIntoAEL(this.tEdgeManager.activeEdges);
                rightBound.setWindingCount(this.tEdgeManager.activeEdges, this.clipType);

                if (rightBound.getContributing(this.clipType, this.fillType)) {
                    outPt = OutRec.addOutPt(this.polyOuts, rightBound, rightBound.Bot);
                }
            } else if (rightBound === null) {
                this.tEdgeManager.activeEdges = leftBound.insertEdgeIntoAEL(this.tEdgeManager.activeEdges);
                leftBound.setWindingCount(this.tEdgeManager.activeEdges, this.clipType);

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = OutRec.addOutPt(this.polyOuts, leftBound, leftBound.Bot);
                }

                this.scanbeam.insert(leftBound.Top.y);
            } else {
                this.tEdgeManager.activeEdges = leftBound.insertEdgeIntoAEL(this.tEdgeManager.activeEdges);
                this.tEdgeManager.activeEdges = rightBound.insertEdgeIntoAEL(this.tEdgeManager.activeEdges, leftBound);
                leftBound.setWindingCount(this.tEdgeManager.activeEdges, this.clipType);
                rightBound.WindCnt = leftBound.WindCnt;
                rightBound.WindCnt2 = leftBound.WindCnt2;

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.AddLocalMinPoly(leftBound, rightBound, leftBound.Bot);
                }

                this.scanbeam.insert(leftBound.Top.y);
            }

            if (rightBound !== null) {
                if (rightBound.isHorizontal) {
                    this.tEdgeManager.sortedEdges = rightBound.addEdgeToSEL(this.tEdgeManager.sortedEdges);
                } else {
                    this.scanbeam.insert(rightBound.Top.y);
                }
            }

            if (leftBound === null || rightBound === null) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            this.joinManager.addOutputJoins(outPt, rightBound);

            this.joinManager.addLeftJoin(outPt, leftBound, this.polyOuts, this.isUseFullRange);

            if (leftBound.NextInAEL !== rightBound) {
                this.joinManager.addRightJoin(outPt, rightBound, this.polyOuts, this.isUseFullRange);

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
        if (this.tEdgeManager.activeEdges === null) {
            return true;
        }

        try {
            this.tEdgeManager.buildIntersectList(botY, topY, this.isUseFullRange);

            if (this.tEdgeManager.intersections.length === 0) {
                return true;
            }

            if (this.tEdgeManager.intersections.length === 1 || this.tEdgeManager.fixupIntersectionOrder()) {
                this.processIntersectList();
            } else {
                return false;
            }
        } catch (error) {
            this.tEdgeManager.sortedEdges = null;
            this.tEdgeManager.intersections.length = 0;

            showError('ProcessIntersections error');
        }

        this.tEdgeManager.sortedEdges = null;

        return true;
    }

    private processIntersectList(): void {
        const intersectCount: number = this.tEdgeManager.intersections.length;
        let i: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            node = this.tEdgeManager.intersections[i];
            this.intersectEdges(node.Edge1, node.Edge2, node.Pt, true);
            this.tEdgeManager.swapPositionsInAEL(node.Edge1, node.Edge2);
        }

        this.tEdgeManager.intersections = [];
    }

    private intersectEdges(edge1: TEdge, edge2: TEdge, point: PointI32, isProtect: boolean): void {
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
                    OutRec.addLocalMaxPoly(this.polyOuts, edge1, edge2, point, this.tEdgeManager.activeEdges);
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
                    this.tEdgeManager.activeEdges = edge1.deleteFromAEL(this.tEdgeManager.activeEdges);
                } else {
                    showError('Error intersecting polylines');
                }
            }

            if (edge2Stops) {
                if (!edge2.isAssigned) {
                    this.tEdgeManager.activeEdges = edge2.deleteFromAEL(this.tEdgeManager.activeEdges);
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
                OutRec.addLocalMaxPoly(this.polyOuts, edge1, edge2, point, this.tEdgeManager.activeEdges);
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
            this.tEdgeManager.activeEdges = edge1.deleteFromAEL(this.tEdgeManager.activeEdges);
        }

        if (edge2Stops) {
            this.tEdgeManager.activeEdges = edge2.deleteFromAEL(this.tEdgeManager.activeEdges);
        }
    }

    private AddLocalMinPoly(edge1: TEdge, edge2: TEdge, point: PointI32) {
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

        this.joinManager.addMinJoin(result, edge, edgePrev, point, this.polyOuts, this.isUseFullRange);

        return result;
    }

    private buildResult(polygons: PointI32[][]): void {
        const polygonCount = this.polyOuts.length;
        let outRec: OutRec = null;
        let polygon: NullPtr<PointI32[]> = null;
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
        this.localMinimaManager.reset();

        this.scanbeam.clean();
        this.localMinimaManager.getScanbeam(this.scanbeam);
        this.tEdgeManager.reset();
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
        let horzEdge: TEdge = this.tEdgeManager.sortedEdges;

        while (horzEdge !== null) {
            this.tEdgeManager.sortedEdges = horzEdge.deleteFromSEL(this.tEdgeManager.sortedEdges);

            this.processHorizontal(horzEdge, isTopOfScanbeam);

            horzEdge = this.tEdgeManager.sortedEdges;
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
                        this.joinManager.prepareHorzJoins(horzEdge, isTopOfScanbeam, this.polyOuts);
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

                    const Pt: PointI32 = PointI32.create(e.Curr.x, horzEdge.Curr.y);

                    if (dir === DIRECTION.RIGHT) {
                        this.intersectEdges(horzEdge, e, Pt, true);
                    } else {
                        this.intersectEdges(e, horzEdge, Pt, true);
                    }

                    this.tEdgeManager.swapPositionsInAEL(horzEdge, e);
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
                this.joinManager.prepareHorzJoins(horzEdge, isTopOfScanbeam, this.polyOuts);
            }

            if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
                horzEdge = this.tEdgeManager.updateEdgeIntoAEL(horzEdge, this.scanbeam);

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
                horzEdge = this.tEdgeManager.updateEdgeIntoAEL(horzEdge, this.scanbeam);

                if (horzEdge.isWindDeletaEmpty) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                this.joinManager.addHorizontalJoin(op1, horzEdge, this.polyOuts, this.isUseFullRange)
            } else {
                horzEdge = this.tEdgeManager.updateEdgeIntoAEL(horzEdge, this.scanbeam);
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
                this.tEdgeManager.activeEdges = horzEdge.deleteFromAEL(this.tEdgeManager.activeEdges);
                this.tEdgeManager.activeEdges = eMaxPair.deleteFromAEL(this.tEdgeManager.activeEdges);
            }
        } else {
            if (horzEdge.isAssigned) {
                OutRec.addOutPt(this.polyOuts, horzEdge, horzEdge.Top);
            }

            this.tEdgeManager.activeEdges = horzEdge.deleteFromAEL(this.tEdgeManager.activeEdges);
        }
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
}
