import { PointI32 } from "../geometry";
import { UNASSIGNED } from "./constants";
import { showError } from "./helpers";
import IntersectNode from "./intersect-node";
import JoinManager from "./join-manager";
import LocalMinima from "./local-minima";
import OutRecManager from "./out-rec-manager";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";
import { CLIP_TYPE, DIRECTION, NullPtr, POLY_FILL_TYPE, POLY_TYPE } from "./types";

export default class TEdgeManager {
    private minimaList: LocalMinima[] = [];
    private activeEdges: number = UNASSIGNED;
    private sortedEdges: number = UNASSIGNED;
    private intersections: IntersectNode[] = [];
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: Scanbeam;
    private joinManager: JoinManager;
    private outRecManager: OutRecManager;
    public isUseFullRange: boolean = false;

    constructor(scanbeam: Scanbeam, joinManager: JoinManager, outRecManager: OutRecManager) {
        this.scanbeam = scanbeam;
        this.joinManager = joinManager;
        this.outRecManager = outRecManager;
    }

    public dispose(): void {    
        TEdge.cleanup();
    }

    public addPath(polygon: PointI32[], polyType: POLY_TYPE): boolean {
        const edgeIndex = this.createPath(polygon, polyType);
        const result = edgeIndex !== UNASSIGNED;

        if (result) {
            this.addEdgeBounds(edgeIndex);
        }

        return result;
    }

    private addEdgeBounds(edgeIndex: number): void {
        let currIndex: number = edgeIndex;
        let nextIndex: number = UNASSIGNED;
        let minIndex: number = UNASSIGNED;

        while (true) {
            currIndex = TEdge.findNextLocMin(currIndex);

            if (currIndex === minIndex) {
                break;
            }

            if (minIndex === UNASSIGNED) {
                minIndex = currIndex;
            }

            const isClockwise = TEdge.getClockwise(currIndex);
            const localMinima: LocalMinima = this.createLocalMinima(currIndex);

            currIndex = TEdge.processBound(localMinima.leftBound, isClockwise);
            nextIndex = TEdge.processBound(localMinima.rightBound, !isClockwise);

            this.insertLocalMinima(localMinima);

            if (!isClockwise) {
                currIndex = nextIndex;
            }
        }
    }

    private insertLocalMinima(localMinima: LocalMinima): void {
        for (let i = 0; i < this.minimaList.length; ++i) {
            if (localMinima.y >= this.minimaList[i].y) {
                this.minimaList.splice(i, 0, localMinima);
                return;
            }
        }
        
        this.minimaList.push(localMinima);
    }

    public popMinima(): number[] {
        if (this.isMinimaEmpty) {
            throw new Error("No minima to pop");
        }

        const minima = this.minimaList.shift()!;
        return [minima.leftBound, minima.rightBound];
    }

    public get isMinimaEmpty(): boolean {
        return this.minimaList.length === 0;
    }

    public get minY(): number {
        return this.isMinimaEmpty ? NaN : this.minimaList[0].y;
    }

    public init(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE): void {
        this.clipType = clipType;
        this.fillType = fillType;
    }

    public createPath(polygon: PointI32[], polyType: POLY_TYPE): number {
        let lastIndex = polygon.length - 1;

        while (
            lastIndex > 0 &&
            (polygon[lastIndex].almostEqual(polygon[0]) || polygon[lastIndex].almostEqual(polygon[lastIndex - 1]))
        ) {
            --lastIndex;
        }

        if (lastIndex < 2) {
            return UNASSIGNED;
        }
        //create a new edge array ...
        const edges: TEdge[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            edges.push(new TEdge());
        }

        //1. Basic (first) edge initialization ...

        //edges[1].Curr = pg[1];
        edges[1].curr.update(polygon[1]);

        this.isUseFullRange = polygon[0].rangeTest(this.isUseFullRange);
        this.isUseFullRange = polygon[lastIndex].rangeTest(this.isUseFullRange);

        edges[0].init(edges[1].current, edges[lastIndex].current, polygon[0]);
        edges[lastIndex].init(edges[0].current, edges[lastIndex - 1].current, polygon[lastIndex]);

        for (i = lastIndex - 1; i >= 1; --i) {
            this.isUseFullRange = polygon[i].rangeTest(this.isUseFullRange);

            edges[i].init(edges[i + 1].current, edges[i - 1].current, polygon[i]);
        }

        return edges[0].removeDuplicates(polyType, this.isUseFullRange);
    }

    public updateEdgeIntoAEL(edgeIndex: number): number {
        const edge = TEdge.at(edgeIndex);

        if (edge.nextLocalMinima === UNASSIGNED) {
            showError('UpdateEdgeIntoAEL: invalid call');
        }

        const result = edge.nextLocalMinima;
        
        
        const nextEdge = TEdge.at(edge.nextLocalMinima);

        nextEdge.index = edge.index;

        if (edge.prevActive !== UNASSIGNED) {
            TEdge.setNeighboar(edge.prevActive, true, true, result);
        } else {
            this.activeEdges = nextEdge.current;
        }

        if (edge.nextActive !== UNASSIGNED) {
            TEdge.setNeighboar(edge.nextActive, false, true, result);
        }

        nextEdge.updateCurrent(edge.current)

        if (!nextEdge.isHorizontal) {
            this.scanbeam.insert(nextEdge.top.y);
        }

        return result;
    }

    public swapPositionsInAEL(edgeIndex1: number, edgeIndex2: number): void {
        const edgeIndex = TEdge.swapPositionsInEL(edgeIndex1, edgeIndex2, true);

        if (edgeIndex !== UNASSIGNED) {
            this.activeEdges = edgeIndex;
        }
    }
    
    public swapPositionsInSEL(edgeIndex1: number, edgeIndex2: number) {
        const edgeIndex = TEdge.swapPositionsInEL(edgeIndex1, edgeIndex2, false);

        if (edgeIndex !== UNASSIGNED) {
            this.sortedEdges = edgeIndex;
        }
    }

    public copyAELToSEL(): void {
        this.sortedEdges = this.activeEdges;

        let currentIndex = this.activeEdges;
        let edge: TEdge = TEdge.at(currentIndex);

        while (currentIndex !== UNASSIGNED) {
            currentIndex = edge.copyAELToSEL();
            edge = TEdge.at(currentIndex);
        }
    }

    public reset(): void {
        for (const minima of this.minimaList) {
            if (minima.leftBound !== UNASSIGNED) {
                TEdge.at(minima.leftBound).reset(DIRECTION.LEFT);
            }
            if (minima.rightBound !== UNASSIGNED) {
                TEdge.at(minima.rightBound).reset(DIRECTION.RIGHT);
            }
        }

        this.scanbeam.clean();

        for (const minima of this.minimaList) {
            this.scanbeam.insert(minima.y);
        }
        
        this.activeEdges = UNASSIGNED;
        this.sortedEdges = UNASSIGNED;  
    }

    public buildIntersectList(botY: number, topY: number): void {
        if (this.activeEdges === UNASSIGNED) {
            return;
        }
        //prepare for sorting ...
        let edge: TEdge = TEdge.at(this.activeEdges);
        //console.log(JSON.stringify(JSON.decycle( e )));
        this.sortedEdges = this.activeEdges;

        while (edge !== null) {
            edge.prevSorted = edge.prevActive;
            edge.nextSorted = edge.nextActive;
            edge.curr.x = edge.topX(topY);
            edge = TEdge.at(edge.nextActive);
        }
        //bubblesort ...
        let isModified: boolean = true;
        let nextEdge: TEdge = null;
        let point: PointI32 = null;

        while (isModified && this.sortedEdges !== UNASSIGNED) {
            isModified = false;
            edge = TEdge.at(this.sortedEdges);

            while (edge.nextSorted !== UNASSIGNED) {
                nextEdge = TEdge.at(edge.nextSorted);
                point = PointI32.create();
                //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
                if (edge.curr.x > nextEdge.curr.x) {
                    if (
                        !TEdge.intersectPoint(edge, nextEdge, point, this.isUseFullRange) &&
                        edge.curr.x > nextEdge.curr.x + 1
                    ) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.set(Math.abs(edge.dx) > Math.abs(nextEdge.dx) ? nextEdge.topX(botY) : edge.topX(botY), botY);
                    }

                    this.intersections.push(new IntersectNode(edge.current, nextEdge.current, point));
                    this.swapPositionsInSEL(edge.current, nextEdge.current);
                    isModified = true;
                } else {
                    edge = nextEdge;
                }
            }

            if (edge.prevSorted !== UNASSIGNED) {
                TEdge.at(edge.prevSorted).nextSorted = UNASSIGNED;
            } else {
                break;
            }
        }

        this.sortedEdges = UNASSIGNED;
    }

    public intersectEdges(edge1: TEdge, edge2: TEdge, point: PointI32, isProtect: boolean): void {
        //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
        //e2 in AEL except when e1 is being inserted at the intersection point ...
        const edge1Stops: boolean = edge1.getStop(point, isProtect);
        const edge2Stops: boolean = edge2.getStop(point, isProtect);
        const edge1Contributing: boolean = edge1.isAssigned;
        const edge2Contributing: boolean = edge2.isAssigned;

        //if either edge is on an OPEN path ...
        if (edge1.isWindDeletaEmpty || edge2.isWindDeletaEmpty) {
            //ignore subject-subject open path intersections UNLESS they
            //are both open paths, AND they are both 'contributing maximas' ...
            this.intersectOpenEdges(edge1, edge2, isProtect, point);
            return;
        }

        //update winding counts...
        //assumes that e1 will be to the Right of e2 ABOVE the intersection
        edge1.alignWndCount(edge2.current);

        const e1Wc: number = edge1.getWndTypeFilled(this.fillType);
        const e2Wc: number = edge2.getWndTypeFilled(this.fillType);

        if (edge1Contributing && edge2Contributing) {
            if (
                edge1Stops ||
                edge2Stops ||
                (e1Wc !== 0 && e1Wc !== 1) ||
                (e2Wc !== 0 && e2Wc !== 1) ||
                edge1.polyTyp !== edge2.polyTyp
            ) {
                this.outRecManager.addLocalMaxPoly(edge1, edge2, point, this.activeEdges);
            } else {
                this.outRecManager.addOutPt(edge1, point);
                this.outRecManager.addOutPt(edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                this.outRecManager.addOutPt(edge1, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                this.outRecManager.addOutPt(edge2, point);
                TEdge.swapSides(edge1, edge2);
                TEdge.swapPolyIndexes(edge1, edge2);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            this.joinManager.swapEdges(e1Wc, e2Wc, edge1, edge2, point);
        }
        if (edge1Stops !== edge2Stops && ((edge1Stops && edge1.isAssigned) || (edge2Stops && edge2.isAssigned))) {
            TEdge.swapSides(edge1, edge2);
            TEdge.swapPolyIndexes(edge1, edge2);
        }
        //finally, delete any non-contributing maxima edges  ...
        if (edge1Stops) {
            this.activeEdges = edge1.deleteFromEL(this.activeEdges, true);
        }

        if (edge2Stops) {
            this.activeEdges = edge2.deleteFromEL(this.activeEdges, true);
        }
    }

    public static sort(node1: IntersectNode, node2: IntersectNode): number {
        //the following typecast is safe because the differences in Pt.Y will
        //be limited to the height of the scanbeam.
        return node2.point.y - node1.point.y;
    }

    public edgesAdjacent(node: IntersectNode): boolean {
        return TEdge.at(node.edge1).nextSorted === node.edge2 || TEdge.at(node.edge1).prevSorted === node.edge2;
    }

    public fixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.intersections.sort(TEdgeManager.sort);

        this.copyAELToSEL();

        const intersectCount: number = this.intersections.length;
        let i: number = 0;
        let j: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            if (!this.edgesAdjacent(this.intersections[i])) {
                j = i + 1;

                while (j < intersectCount && !this.edgesAdjacent(this.intersections[j])) {
                    ++j;
                }

                if (j === intersectCount) {
                    return false;
                }

                node = this.intersections[i];
                this.intersections[i] = this.intersections[j];
                this.intersections[j] = node;
            }

            this.swapPositionsInSEL(this.intersections[i].edge1, this.intersections[i].edge2);
        }

        return true;
    }

    public intersectOpenEdges(edge1: TEdge, edge2: TEdge, isProtect: boolean, point: PointI32) {
        const edge1Stops: boolean = !isProtect && edge1.nextLocalMinima === UNASSIGNED && edge1.top.almostEqual(point);
        const edge2Stops: boolean = !isProtect && edge2.nextLocalMinima === UNASSIGNED && edge2.top.almostEqual(point);
        const edge1Contributing: boolean = edge1.isAssigned;
        const edge2Contributing: boolean = edge2.isAssigned;
         //ignore subject-subject open path intersections UNLESS they
        //are both open paths, AND they are both 'contributing maximas' ...
        if (edge1.isWindDeletaEmpty && edge2.isWindDeletaEmpty) {
            if ((edge1Stops || edge2Stops) && edge1Contributing && edge2Contributing) {
                this.outRecManager.addLocalMaxPoly(edge1, edge2, point, this.activeEdges);
            }
        }
        //if intersecting a subj line with a subj poly ...
        else if (
            edge1.polyTyp === edge2.polyTyp &&
            edge1.windDelta !== edge2.windDelta &&
            this.clipType === CLIP_TYPE.UNION
        ) {
            if (edge1.isWindDeletaEmpty) {
                if (edge2Contributing) {
                    this.outRecManager.addOutPt(edge1, point);

                    if (edge1Contributing) {
                        edge1.unassign();
                    }
                }
            } else {
                if (edge1Contributing) {
                    this.outRecManager.addOutPt(edge2, point);

                    if (edge2Contributing) {
                        edge2.unassign();
                    }
                }
            }
        } else if (edge1.polyTyp !== edge2.polyTyp) {
            if (
                edge1.isWindDeletaEmpty &&
                Math.abs(edge2.windCount1) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || edge2.windCount2 === 0)
            ) {
                this.outRecManager.addOutPt(edge1, point);

                if (edge1Contributing) {
                    edge1.unassign();
                }
            } else if (
                edge2.isWindDeletaEmpty &&
                Math.abs(edge1.windCount1) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || edge1.windCount2 === 0)
            ) {
                this.outRecManager.addOutPt(edge2, point);

                if (edge2Contributing) {
                    edge2.unassign();
                }
            }
        }

        if (edge1Stops) {
            if (!edge1.isAssigned) {
                this.activeEdges = edge1.deleteFromEL(this.activeEdges, true);
            } else {
                showError('Error intersecting polylines');
            }
        }

        if (edge2Stops) {
            if (!edge2.isAssigned) {
                this.activeEdges = edge2.deleteFromEL(this.activeEdges, true);
            } else {
                showError('Error intersecting polylines');
            }
        }
    }

    public processHorizontal(horzEdge: TEdge, isTopOfScanbeam: boolean) {
        let dirValue: Float64Array = horzEdge.horzDirection;
        let dir: DIRECTION = dirValue[0] as DIRECTION;
        let horzLeft: number = dirValue[1];
        let horzRight: number = dirValue[2];

        let eLastHorz: NullPtr<TEdge> = horzEdge;
        let eMaxPair: NullPtr<TEdge> = null;

        while (eLastHorz.nextLocalMinima !== UNASSIGNED && TEdge.at(eLastHorz.nextLocalMinima).isHorizontal) {
            eLastHorz = TEdge.at(eLastHorz.nextLocalMinima);
        }

        if (eLastHorz.nextLocalMinima === UNASSIGNED) {
            eMaxPair = TEdge.at(eLastHorz.maximaPair);
        }

        while (true) {
            const isLastHorz: boolean = horzEdge === eLastHorz;
            let e: NullPtr<TEdge> = horzEdge.getNextInAEL(dir);
            let eNext: NullPtr<TEdge> = null;

            while (e !== null) {
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (e.curr.x === horzEdge.top.x && horzEdge.nextLocalMinima !== UNASSIGNED && e.dx < TEdge.at(horzEdge.nextLocalMinima).dx) {
                    break;
                }

                eNext = e.getNextInAEL(dir);
                //saves eNext for later
                if ((dir === DIRECTION.RIGHT && e.curr.x <= horzRight) || (dir === DIRECTION.LEFT && e.curr.x >= horzLeft)) {
                    if (horzEdge.isFilled) {
                        this.joinManager.prepareHorzJoins(horzEdge, isTopOfScanbeam);
                    }

                    //so far we're still in range of the horizontal Edge  but make sure
                    //we're at the last of consec. horizontals when matching with eMaxPair
                    if (e === eMaxPair && isLastHorz) {
                        if (dir === DIRECTION.RIGHT) {
                            this.intersectEdges(horzEdge, e, e.top, false);
                        } else {
                            this.intersectEdges(e, horzEdge, e.top, false);
                        }
                        if (eMaxPair.isAssigned) {
                            showError('ProcessHorizontal error');
                        }

                        return;
                    }

                    const Pt: PointI32 = PointI32.create(e.curr.x, horzEdge.curr.y);

                    if (dir === DIRECTION.RIGHT) {
                        this.intersectEdges(horzEdge, e, Pt, true);
                    } else {
                        this.intersectEdges(e, horzEdge, Pt, true);
                    }

                    this.swapPositionsInAEL(horzEdge.current, e.current);
                } else if (
                    (dir === DIRECTION.RIGHT && e.curr.x >= horzRight) ||
                    (dir === DIRECTION.LEFT && e.curr.x <= horzLeft)
                ) {
                    break;
                }

                e = eNext;
            }
            //end while
            if (horzEdge.isFilled) {
                this.joinManager.prepareHorzJoins(horzEdge, isTopOfScanbeam);
            }

            if (horzEdge.nextLocalMinima !== UNASSIGNED && TEdge.at(horzEdge.nextLocalMinima).isHorizontal) {
                horzEdge = TEdge.at(this.updateEdgeIntoAEL(horzEdge.current));

                if (horzEdge.isAssigned) {
                    this.outRecManager.addOutPt(horzEdge, horzEdge.bot);
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
        if (horzEdge.nextLocalMinima !== UNASSIGNED) {
            if (horzEdge.isAssigned) {
                const op1 = this.outRecManager.addOutPt(horzEdge, horzEdge.top);
                horzEdge = TEdge.at(this.updateEdgeIntoAEL(horzEdge.current));

                if (horzEdge.isWindDeletaEmpty) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                this.joinManager.addHorizontalJoin(op1, horzEdge)
            } else {
                horzEdge = TEdge.at(this.updateEdgeIntoAEL(horzEdge.current));
            }
        } else if (eMaxPair !== null) {
            if (eMaxPair.isAssigned) {
                if (dir === DIRECTION.RIGHT) {
                    this.intersectEdges(horzEdge, eMaxPair, horzEdge.top, false);
                } else {
                    this.intersectEdges(eMaxPair, horzEdge, horzEdge.top, false);
                }
                if (eMaxPair.isAssigned) {
                    showError('ProcessHorizontal error');
                }
            } else {
                this.activeEdges = horzEdge.deleteFromEL(this.activeEdges, true);
                this.activeEdges = eMaxPair.deleteFromEL(this.activeEdges, true);
            }
        } else {
            if (horzEdge.isAssigned) {
                this.outRecManager.addOutPt(horzEdge, horzEdge.top);
            }

            this.activeEdges = horzEdge.deleteFromEL(this.activeEdges, true);
        }
    }

    public processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdge: TEdge = TEdge.at(this.sortedEdges);

        while (horzEdge !== null) {
            this.sortedEdges = horzEdge.deleteFromEL(this.sortedEdges, false);

            this.processHorizontal(horzEdge, isTopOfScanbeam);

            horzEdge = TEdge.at(this.sortedEdges);
        }
    }

    public processEdgesAtTopOfScanbeam(topY: number, strictlySimple: boolean): void {
        let edge1: TEdge = TEdge.at(this.activeEdges);
        let edge2: NullPtr<TEdge> = null;
        let isMaximaEdge: boolean = false;
        let outPt1: number = UNASSIGNED;

        while (edge1 !== null) {
            //1. process maxima, treating them as if they're 'bent' horizontal edges,
            //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
            isMaximaEdge = edge1.getMaxima(topY);

            if (isMaximaEdge) {
                edge2 = TEdge.at(edge1.maximaPair);
                isMaximaEdge = edge2 === null || !edge2.isHorizontal;
            }

            if (isMaximaEdge) {
                edge2 = TEdge.at(edge1.prevActive);
                this.doMaxima(edge1);

                edge1 = edge2 === null ? TEdge.at(this.activeEdges) : TEdge.at(edge2.nextActive);
            } else {
                //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
                if (edge1.getIntermediate(topY) && TEdge.at(edge1.nextLocalMinima).isHorizontal) {
                    edge1 = TEdge.at(this.updateEdgeIntoAEL(edge1.current));

                    if (edge1.isAssigned) {
                        this.outRecManager.addOutPt(edge1, edge1.bot);
                    }

                    this.sortedEdges = edge1.addEdgeToSEL(this.sortedEdges);
                } else {
                    edge1.curr.set(edge1.topX(topY), topY);
                }

                if (strictlySimple) {
                    edge2 = TEdge.at(edge1.prevActive);

                    this.joinManager.addScanbeamJoin(edge1, edge2);
                }
                edge1 = TEdge.at(edge1.nextActive);
            }
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.processHorizontals(true);
        //4. Promote intermediate vertices ...
        edge1 = TEdge.at(this.activeEdges);

        while (edge1 !== null) {
            if (edge1.getIntermediate(topY)) {
                outPt1 = edge1.isAssigned ? this.outRecManager.addOutPt(edge1, edge1.top) : UNASSIGNED;
                edge1 = TEdge.at(this.updateEdgeIntoAEL(edge1.current));
                //if output polygons share an edge, they'll need joining later...
                this.joinManager.addSharedJoin(outPt1, edge1);
            }

            edge1 = TEdge.at(edge1.nextActive);
        }
    }

        private doMaxima(edge: TEdge): void {
            const maxPairEdge: NullPtr<TEdge> = TEdge.at(edge.maximaPair);
    
            if (maxPairEdge === null) {
                if (edge.isAssigned) {
                    this.outRecManager.addOutPt(edge, edge.top);
                }
    
                this.activeEdges = edge.deleteFromEL(this.activeEdges, true);
    
                return;
            }
    
            let nextEdge: NullPtr<TEdge> = TEdge.at(edge.nextActive);
    
            while (nextEdge !== null && nextEdge !== maxPairEdge) {
                this.intersectEdges(edge, nextEdge, edge.top, true);
                this.swapPositionsInAEL(edge.current, nextEdge.current);
                nextEdge = TEdge.at(edge.nextActive);
            }
    
            if (!edge.isAssigned && !maxPairEdge.isAssigned) {
                this.activeEdges = edge.deleteFromEL(this.activeEdges, true);
                this.activeEdges = maxPairEdge.deleteFromEL(this.activeEdges, true);
            } else if (edge.isAssigned && maxPairEdge.isAssigned) {
                this.intersectEdges(edge, maxPairEdge, edge.top, false);
            } else if (edge.isWindDeletaEmpty) {
                if (edge.isAssigned) {
                    this.outRecManager.addOutPt(edge, edge.top);
                    edge.unassign();
                }
    
                this.activeEdges = edge.deleteFromEL(this.activeEdges, true);
    
                if (maxPairEdge.isAssigned) {
                    this.outRecManager.addOutPt(maxPairEdge, edge.top);
                    maxPairEdge.unassign();
                }
    
                this.activeEdges = maxPairEdge.deleteFromEL(this.activeEdges, true);
            } else {
                showError('DoMaxima error');
            }
        }

    public processIntersectList(): void {
        const intersectCount: number = this.intersections.length;
        let i: number = 0;
        let node: IntersectNode = null;

        for (i = 0; i < intersectCount; ++i) {
            node = this.intersections[i];
            this.intersectEdges(TEdge.at(node.edge1), TEdge.at(node.edge2), node.point, true);
            this.swapPositionsInAEL(node.edge1, node.edge2);
        }

        this.intersections = [];
    }

    public processIntersections(botY: number, topY: number): boolean {
        if (this.activeEdges === UNASSIGNED) {
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
            this.sortedEdges = UNASSIGNED;
            this.intersections.length = 0;

            showError('ProcessIntersections error');
        }

        this.sortedEdges = UNASSIGNED;

        return true;
    }

    public insertLocalMinimaIntoAEL(botY: number): void {
        let outPt: number = UNASSIGNED;

        while (!Number.isNaN(this.minY) && this.minY === botY) {
            let [leftBoundIndex, rightBoundIndex] = this.popMinima();
            const leftBound: NullPtr<TEdge> = TEdge.at(leftBoundIndex);
            const rightBound: NullPtr<TEdge> = TEdge.at(rightBoundIndex);
            outPt = UNASSIGNED;

            if (leftBound === null) {
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges);
                rightBound.setWindingCount(this.activeEdges, this.clipType);

                if (rightBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(rightBound, rightBound.bot);
                }
            } else if (rightBound === null) {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                leftBound.setWindingCount(this.activeEdges, this.clipType);

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(leftBound, leftBound.bot);
                }

                this.scanbeam.insert(leftBound.top.y);
            } else {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges, leftBound.current);
                leftBound.setWindingCount(this.activeEdges, this.clipType);
                rightBound.windCount1 = leftBound.windCount1;
                rightBound.windCount2 = leftBound.windCount2;

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.joinManager.addLocalMinPoly(leftBound, rightBound, leftBound.bot);
                }

                this.scanbeam.insert(leftBound.top.y);
            }

            if (rightBound !== null) {
                if (rightBound.isHorizontal) {
                    this.sortedEdges = rightBound.addEdgeToSEL(this.sortedEdges);
                } else {
                    this.scanbeam.insert(rightBound.top.y);
                }
            }

            if (leftBound === null || rightBound === null) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            this.joinManager.addOutputJoins(outPt, rightBound);

            this.joinManager.addLeftJoin(outPt, leftBound);

            if (leftBound.nextActive !== rightBound.current) {
                this.joinManager.addRightJoin(outPt, rightBound);

                let edge: NullPtr<TEdge> = TEdge.at(leftBound.nextActive);

                if (edge !== null)
                    while (edge !== rightBound) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.intersectEdges(rightBound, edge, leftBound.curr, false);
                        //order important here
                        edge = TEdge.at(edge.nextActive);
                    }
            }
        }
    }

    public createLocalMinima(edgeIndex: number): LocalMinima {
        const currEdge: TEdge = TEdge.at(edgeIndex);
        const prevEdge: TEdge = TEdge.at(currEdge.prev);
        const isClockwise = currEdge.dx >= prevEdge.dx;
        const y = currEdge.bot.y;
        const leftBound = isClockwise ? currEdge : prevEdge;
        const rightBound = isClockwise ? prevEdge : currEdge;
        leftBound.side = DIRECTION.LEFT;
        rightBound.side = DIRECTION.RIGHT;
        leftBound.windDelta = leftBound.next === rightBound.current ? -1 : 1;
        rightBound.windDelta = -leftBound.windDelta;

        return new LocalMinima(y, leftBound.current, rightBound.current);
    }
}