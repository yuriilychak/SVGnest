import { PointI32 } from "../geometry";
import { UNASSIGNED } from "./constants";
import { showError } from "./helpers";
import IntersectNode from "./intersect-node";
import LocalMinima from "./local-minima";
import OutRecManager from "./out-rec-manager";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from "./types";

export default class TEdgeManager {
    private localMinima: LocalMinima;
    private activeEdges: number = UNASSIGNED;
    private sortedEdges: number = UNASSIGNED;
    private intersections: IntersectNode;
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: Scanbeam;
    private outRecManager: OutRecManager;
    private paths: number[][];
    public isUseFullRange: boolean = false;

    constructor(scanbeam: Scanbeam, outRecManager: OutRecManager) {
        this.intersections = new IntersectNode();
        this.localMinima = new LocalMinima();
        this.scanbeam = scanbeam;
        this.outRecManager = outRecManager;
        this.paths = [];
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
            currIndex = this.findNextLocMin(currIndex);

            if (currIndex === minIndex) {
                break;
            }

            if (minIndex === UNASSIGNED) {
                minIndex = currIndex;
            }

            const isClockwise = this.getClockwise(currIndex);
            const localMinima = this.createLocalMinima(currIndex);

            currIndex = this.processBound(this.localMinima.getLeftBound(localMinima), isClockwise);
            nextIndex = this.processBound(this.localMinima.getRightBound(localMinima), !isClockwise);

            if (!isClockwise) {
                currIndex = nextIndex;
            }
        }
    }

    public getClockwise(index: number): boolean {
        const currEdge = TEdge.at(index);
        const prevEdge = TEdge.at(currEdge.prev);

        return currEdge.dx >= prevEdge.dx;
    }

    public get isMinimaEmpty(): boolean {
        return this.localMinima.isEmpty;
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
        const path: number[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            const edge = new TEdge();
            edges.push(edge);
            path.push(edge.current);
        }

        //1. Basic (first) edge initialization ...

        //edges[1].Curr = pg[1];
        edges[1].curr.update(polygon[1]);

        this.isUseFullRange = polygon[0].rangeTest(this.isUseFullRange);
        this.isUseFullRange = polygon[lastIndex].rangeTest(this.isUseFullRange);

        this.initEdge(edges[0].current, edges[1].current, edges[lastIndex].current, polygon[0]);
        this.initEdge(edges[lastIndex].current, edges[0].current, edges[lastIndex - 1].current, polygon[lastIndex]);

        for (i = lastIndex - 1; i >= 1; --i) {
            this.isUseFullRange = polygon[i].rangeTest(this.isUseFullRange);

            this.initEdge(edges[i].current, edges[i + 1].current, edges[i - 1].current, polygon[i]);
        }

        return this.removeDuplicates(edges[0].current, polyType, this.isUseFullRange);
    }

    private initEdge(edgeIndex: number, nextIndex: number, prevIndex: number, point: PointI32): void {
        const edge = TEdge.at(edgeIndex);
        edge.next = nextIndex;
        edge.prev = prevIndex;
        edge.curr.update(point);
    }

    private removeDuplicates(index: number, polyType: POLY_TYPE, isUseFullRange: boolean): number {
        let startIndex: number = index;
        let stopIndex: number = index;
        let currIndex: number = index;
        //2. Remove duplicate vertices, and (when closed) collinear edges ...

        while (true) {
            const currEdge = TEdge.at(currIndex);
            const nextEdge = TEdge.at(currEdge.next);
            const prevEdge = TEdge.at(currEdge.prev);

            if (currEdge.curr.almostEqual(nextEdge.curr)) {
                if (currIndex === nextEdge.next) {
                    break;
                }

                if (currEdge.current === startIndex) {
                    startIndex = nextEdge.current;
                }

                currIndex = this.removeEdge(currEdge.current);
                stopIndex = currIndex;

                continue;
            }

            if (currEdge.prev === currEdge.next) {
                break;
            }

            if (PointI32.slopesEqual(prevEdge.curr, currEdge.curr, nextEdge.curr, isUseFullRange)) {
                //Collinear edges are allowed for open paths but in closed paths
                //the default is to merge adjacent collinear edges into a single edge.
                //However, if the PreserveCollinear property is enabled, only overlapping
                //collinear edges (ie spikes) will be removed from closed paths.
                if (currEdge.current === startIndex) {
                    startIndex = currEdge.next;
                }

                this.removeEdge(currEdge.current);
                currIndex = prevEdge.current;
                stopIndex = currIndex;

                continue;
            }

            currIndex = nextEdge.current;

            if (currIndex === stopIndex) {
                break;
            }
        }

        const edge = TEdge.at(currIndex);

        if (edge.prev === edge.next) {
            return UNASSIGNED;
        }

        //3. Do second stage of edge initialization ...
        const startEdge = TEdge.at(startIndex);
        let isFlat: boolean = true;

        currIndex = startIndex;

        do {
            const edge1 = TEdge.at(currIndex);
            const next = TEdge.at(edge1.next);

            if (edge1.curr.y >= next.curr.y) {
                edge1.bot.update(edge1.curr);
                edge1.top.update(next.curr);
            } else {
                edge1.top.update(edge1.curr);
                edge1.bot.update(next.curr);
            }

            edge1.setDx();
            edge1.polyTyp = polyType;

            currIndex = edge1.next;

            const edge2 = TEdge.at(currIndex);

            if (isFlat && edge2.curr.y !== startEdge.curr.y) {
                isFlat = false;
            }
        } while (currIndex !== startIndex);
        //4. Finally, add edge bounds to LocalMinima list ...
        //Totally flat paths must be handled differently when adding them
        //to LocalMinima list to avoid endless loops etc ...
        return isFlat ? UNASSIGNED : currIndex;
    }

    public findNextLocMin(index: number): number {
        let result: number = index;

        while (true) {
            let currEdge = TEdge.at(result);
            let prevEdge = TEdge.at(currEdge.prev);

            while (!currEdge.bot.almostEqual(prevEdge.bot) || currEdge.curr.almostEqual(currEdge.top)) {
                result = currEdge.next;
                currEdge = TEdge.at(result);
                prevEdge = TEdge.at(currEdge.prev);
            }

            if (!currEdge.isDxHorizontal && !prevEdge.isDxHorizontal) {
                break;
            }

            while (prevEdge.isDxHorizontal) {
                result = currEdge.prev;
                currEdge = TEdge.at(result);
                prevEdge = TEdge.at(currEdge.prev);
            }

            const edgeIndex = result

            while (currEdge.isDxHorizontal) {
                result = currEdge.next;
                currEdge = TEdge.at(result);
                prevEdge = TEdge.at(currEdge.prev);
            }

            if (currEdge.top.y === prevEdge.bot.y) {
                continue;
            }

            const tempEdge = TEdge.at(edgeIndex);
            prevEdge = TEdge.at(tempEdge.prev);
            //ie just an intermediate horz.
            if (prevEdge.bot.x < currEdge.bot.x) {
                result = edgeIndex;
            }

            break;
        }

        return result;
    }

    public removeEdge(edgeIndex: number): number {
        const edge = TEdge.at(edgeIndex);
        const result: number = edge.next;
        const next = TEdge.at(edge.next);
        const prev = TEdge.at(edge.prev);
        //removes e from double_linked_list (but without removing from memory)
        prev.next = edge.next;
        next.prev = edge.prev;
        edge.prev = UNASSIGNED; //flag as removed (see ClipperBase.Clear)
        edge.next = UNASSIGNED;

        return result;
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
        let edge = TEdge.at(currentIndex);

        while (currentIndex !== UNASSIGNED) {
            currentIndex = edge.copyAELToSEL();
            edge = TEdge.at(currentIndex);
        }
    }

    public reset(): void {
        this.scanbeam.clean();

        const minimaCount = this.localMinima.length;

        for(let i = 0; i < minimaCount; ++i) {
            const leftBound = this.localMinima.getLeftBound(i);
            const rightBound = this.localMinima.getRightBound(i);
            const y = this.localMinima.getY(i);

            if (leftBound !== UNASSIGNED) {
                TEdge.at(leftBound).reset(DIRECTION.LEFT);
            }
            if (rightBound !== UNASSIGNED) {
                TEdge.at(rightBound).reset(DIRECTION.RIGHT);
            }

            this.scanbeam.insert(y);
        }
        
        this.activeEdges = UNASSIGNED;
        this.sortedEdges = UNASSIGNED;  
    }

    public buildIntersectList(botY: number, topY: number): void {
        if (this.activeEdges === UNASSIGNED) {
            return;
        }
        //prepare for sorting ...
        //console.log(JSON.stringify(JSON.decycle( e )));
        this.sortedEdges = this.activeEdges;

        let edgeIndex = this.activeEdges;

        while (edgeIndex !== UNASSIGNED) {
            const edge = TEdge.at(edgeIndex);

            edge.prevSorted = edge.prevActive;
            edge.nextSorted = edge.nextActive;
            edge.curr.x = edge.topX(topY);
            edgeIndex = edge.nextActive;
        }

        //bubblesort ...
        let isModified: boolean = true;
        const point: PointI32 = PointI32.create();

        while (isModified && this.sortedEdges !== UNASSIGNED) {
            isModified = false;
            let edge = TEdge.at(this.sortedEdges);

            while (edge.nextSorted !== UNASSIGNED) {
                const nextEdge = TEdge.at(edge.nextSorted);
                point.set(0, 0);
                //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
                if (edge.curr.x > nextEdge.curr.x) {
                    if (
                        !TEdge.intersectPoint(edge.current, nextEdge.current, point, this.isUseFullRange) &&
                        edge.curr.x > nextEdge.curr.x + 1
                    ) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.set(Math.abs(edge.dx) > Math.abs(nextEdge.dx) ? nextEdge.topX(botY) : edge.topX(botY), botY);
                    }

                    this.intersections.add(edge.current, nextEdge.current, point);
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

    public intersectEdges(edge1Index: number, edge2Index: number, point: PointI32, isProtect: boolean): void {
        //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
        //e2 in AEL except when e1 is being inserted at the intersection point ...
        const edge1 = TEdge.at(edge1Index);
        const edge2 = TEdge.at(edge2Index);
        const edge1Stops: boolean = edge1.getStop(point, isProtect);
        const edge2Stops: boolean = edge2.getStop(point, isProtect);
        const edge1Contributing: boolean = edge1.isAssigned;
        const edge2Contributing: boolean = edge2.isAssigned;

        //if either edge is on an OPEN path ...
        if (edge1.isWindDeletaEmpty || edge2.isWindDeletaEmpty) {
            //ignore subject-subject open path intersections UNLESS they
            //are both open paths, AND they are both 'contributing maximas' ...
            this.intersectOpenEdges(edge1Index, edge2Index, isProtect, point);
            return;
        }

        //update winding counts...
        //assumes that e1 will be to the Right of e2 ABOVE the intersection
        edge1.alignWndCount(edge2Index);

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
                this.outRecManager.addLocalMaxPoly(edge1Index, edge2Index, point, this.activeEdges);
            } else {
                this.outRecManager.addOutPt(edge1Index, point);
                this.outRecManager.addOutPt(edge2Index, point);
                TEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                this.outRecManager.addOutPt(edge1Index, point);
                TEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                this.outRecManager.addOutPt(edge2Index, point);
                TEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            if (TEdge.swapEdges(this.clipType, this.fillType, e1Wc, e2Wc, edge1Index, edge2Index)) {
                this.outRecManager.addLocalMinPoly(edge1Index, edge2Index, point, this.isUseFullRange);
            }
        }
        if (edge1Stops !== edge2Stops && ((edge1Stops && edge1.isAssigned) || (edge2Stops && edge2.isAssigned))) {
            TEdge.swapSidesAndIndeces(edge1Index, edge2Index);
        }
        //finally, delete any non-contributing maxima edges  ...
        if (edge1Stops) {
            this.deleteFromActive(edge1.current);
        }

        if (edge2Stops) {
            this.deleteFromActive(edge2.current);
        }
    }

    public edgesAdjacent(nodeIndex: number): boolean {
        const edge1Index = this.intersections.getEdge1Index(nodeIndex);
        const edge2Index = this.intersections.getEdge2Index(nodeIndex);

        return TEdge.getNeighboar(edge1Index, true, false) === edge2Index || TEdge.getNeighboar(edge1Index, false, false) === edge2Index;
    }

    public fixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.intersections.sort();

        this.copyAELToSEL();

        const intersectCount: number = this.intersections.length;
        let i: number = 0;
        let j: number = 0;

        for (i = 0; i < intersectCount; ++i) {
            if (!this.edgesAdjacent(i)) {
                j = i + 1;

                while (j < intersectCount && !this.edgesAdjacent(j)) {
                    ++j;
                }

                if (j === intersectCount) {
                    return false;
                }

                this.intersections.swap(i, j);
            }

            this.swapPositionsInSEL(this.intersections.getEdge1Index(i), this.intersections.getEdge2Index(i));
        }

        return true;
    }

    public intersectOpenEdges(edge1Index: number, edge2Index: number, isProtect: boolean, point: PointI32) {
        const edge1 = TEdge.at(edge1Index);
        const edge2 = TEdge.at(edge2Index);
        const edge1Stops: boolean = !isProtect && edge1.nextLocalMinima === UNASSIGNED && edge1.top.almostEqual(point);
        const edge2Stops: boolean = !isProtect && edge2.nextLocalMinima === UNASSIGNED && edge2.top.almostEqual(point);
        const edge1Contributing: boolean = edge1.isAssigned;
        const edge2Contributing: boolean = edge2.isAssigned;
         //ignore subject-subject open path intersections UNLESS they
        //are both open paths, AND they are both 'contributing maximas' ...
        if (edge1.isWindDeletaEmpty && edge2.isWindDeletaEmpty) {
            if ((edge1Stops || edge2Stops) && edge1Contributing && edge2Contributing) {
                this.outRecManager.addLocalMaxPoly(edge1.current, edge2.current, point, this.activeEdges);
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
                    this.outRecManager.addOutPt(edge1.current, point);

                    if (edge1Contributing) {
                        edge1.unassign();
                    }
                }
            } else {
                if (edge1Contributing) {
                    this.outRecManager.addOutPt(edge2.current, point);

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
                this.outRecManager.addOutPt(edge1.current, point);

                if (edge1Contributing) {
                    edge1.unassign();
                }
            } else if (
                edge2.isWindDeletaEmpty &&
                Math.abs(edge1.windCount1) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || edge1.windCount2 === 0)
            ) {
                this.outRecManager.addOutPt(edge2.current, point);

                if (edge2Contributing) {
                    edge2.unassign();
                }
            }
        }

        if (edge1Stops) {
            if (!edge1.isAssigned) {
                this.deleteFromActive(edge1.current);
            } else {
                showError('Error intersecting polylines');
            }
        }

        if (edge2Stops) {
            if (!edge2.isAssigned) {
                this.deleteFromActive(edge2.current);
            } else {
                showError('Error intersecting polylines');
            }
        }
    }

    public processHorizontal(horzEdgeIndex: number, isTopOfScanbeam: boolean) {
        let horzEdge = TEdge.at(horzEdgeIndex);
        let dirValue: Float64Array = horzEdge.horzDirection;
        let dir: DIRECTION = dirValue[0] as DIRECTION;
        let horzLeft: number = dirValue[1];
        let horzRight: number = dirValue[2];

        let eLastHorz = horzEdge;

        while (eLastHorz.nextLocalMinima !== UNASSIGNED && TEdge.at(eLastHorz.nextLocalMinima).isHorizontal) {
            eLastHorz = TEdge.at(eLastHorz.nextLocalMinima);
        }

        const eMaxPairIndex = eLastHorz.nextLocalMinima === UNASSIGNED ? this.maximaPair(eLastHorz.current) : UNASSIGNED;

        while (true) {
            const isLastHorz: boolean = horzEdge === eLastHorz;
            let currIndex = TEdge.getNeighboar(horzEdge.current, dir === DIRECTION.RIGHT, true);
            let nextIndex = UNASSIGNED;

            while (currIndex !== UNASSIGNED) {
                const edge = TEdge.at(currIndex);
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (edge.curr.x === horzEdge.top.x && horzEdge.nextLocalMinima !== UNASSIGNED && edge.dx < TEdge.at(horzEdge.nextLocalMinima).dx) {
                    break;
                }

                nextIndex = TEdge.getNeighboar(edge.current, dir === DIRECTION.RIGHT, true);
                //saves eNext for later
                if ((dir === DIRECTION.RIGHT && edge.curr.x <= horzRight) || (dir === DIRECTION.LEFT && edge.curr.x >= horzLeft)) {
                    if (horzEdge.isFilled && isTopOfScanbeam) {
                        this.outRecManager.prepareHorzJoins(horzEdge.current);
                    }

                    //so far we're still in range of the horizontal Edge  but make sure
                    //we're at the last of consec. horizontals when matching with eMaxPair
                    if (edge.current === eMaxPairIndex && isLastHorz) {
                        if (dir === DIRECTION.RIGHT) {
                            this.intersectEdges(horzEdge.current, edge.current, edge.top, false);
                        } else {
                            this.intersectEdges(edge.current, horzEdge.current, edge.top, false);
                        }

                        const eMaxPair = TEdge.at(eMaxPairIndex);

                        if (eMaxPair.isAssigned) {
                            showError('ProcessHorizontal error');
                        }

                        return;
                    }

                    const Pt: PointI32 = PointI32.create(edge.curr.x, horzEdge.curr.y);

                    if (dir === DIRECTION.RIGHT) {
                        this.intersectEdges(horzEdge.current, edge.current, Pt, true);
                    } else {
                        this.intersectEdges(edge.current, horzEdge.current, Pt, true);
                    }

                    this.swapPositionsInAEL(horzEdge.current, edge.current);
                } else if (
                    (dir === DIRECTION.RIGHT && edge.curr.x >= horzRight) ||
                    (dir === DIRECTION.LEFT && edge.curr.x <= horzLeft)
                ) {
                    break;
                }

                currIndex = nextIndex;
            }
            //end while
            if (horzEdge.isFilled && isTopOfScanbeam) {
                this.outRecManager.prepareHorzJoins(horzEdge.current);
            }

            if (horzEdge.nextLocalMinima !== UNASSIGNED && TEdge.at(horzEdge.nextLocalMinima).isHorizontal) {
                horzEdge = TEdge.at(this.updateEdgeIntoAEL(horzEdge.current));

                if (horzEdge.isAssigned) {
                    this.outRecManager.addOutPt(horzEdge.current, horzEdge.bot);
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
                const op1 = this.outRecManager.addOutPt(horzEdge.current, horzEdge.top);
                horzEdge = TEdge.at(this.updateEdgeIntoAEL(horzEdge.current));

                if (horzEdge.isWindDeletaEmpty) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                const condition1 = horzEdge.checkHorizontalCondition(false, this.isUseFullRange);

                this.outRecManager.insertJoin(condition1, op1, horzEdge.prevActive, horzEdge.bot);

                if (!condition1) {
                    const condition2 = horzEdge.checkHorizontalCondition(true, this.isUseFullRange);

                    this.outRecManager.insertJoin(condition2, op1, horzEdge.nextActive, horzEdge.bot);
                }
            } else {
                horzEdge = TEdge.at(this.updateEdgeIntoAEL(horzEdge.current));
            }
        } else if (eMaxPairIndex !== UNASSIGNED) {
            const eMaxPair = TEdge.at(eMaxPairIndex);

            if (eMaxPair.isAssigned) {
                if (dir === DIRECTION.RIGHT) {
                    this.intersectEdges(horzEdge.current, eMaxPairIndex, horzEdge.top, false);
                } else {
                    this.intersectEdges(eMaxPairIndex, horzEdge.current, horzEdge.top, false);
                }

                if (eMaxPair.isAssigned) {
                    showError('ProcessHorizontal error');
                }
            } else {
                this.deleteFromActive(horzEdge.current);
                this.deleteFromActive(eMaxPair.current);
            }
        } else {
            if (horzEdge.isAssigned) {
                this.outRecManager.addOutPt(horzEdge.current, horzEdge.top);
            }

            this.deleteFromActive(horzEdge.current);
        }
    }

    public processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdgeIndex = this.sortedEdges;

        while (horzEdgeIndex !== UNASSIGNED) {
            this.deleteFromSorted(horzEdgeIndex);

            this.processHorizontal(horzEdgeIndex, isTopOfScanbeam);

            horzEdgeIndex = this.sortedEdges;
        }
    }

    public processEdgesAtTopOfScanbeam(topY: number, strictlySimple: boolean): void {
        let isMaximaEdge: boolean = false;
        let outPt1: number = UNASSIGNED;
        let edgeIndex: number = this.activeEdges;

        while (edgeIndex !== UNASSIGNED) {
            let edge = TEdge.at(edgeIndex);
            //1. process maxima, treating them as if they're 'bent' horizontal edges,
            //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
            isMaximaEdge = edge.getMaxima(topY);

            if (isMaximaEdge) {
                const tempEdge = TEdge.at(this.maximaPair(edge.current));
                isMaximaEdge = this.maximaPair(edge.current) === UNASSIGNED || !tempEdge.isHorizontal;
            }

            if (isMaximaEdge) {
                const tempEdge = TEdge.at(edge.prevActive);
                this.doMaxima(edge.current);

                edgeIndex = edge.prevActive === UNASSIGNED ? this.activeEdges : tempEdge.nextActive;
                continue;
            }

            //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
            if (edge.getIntermediate(topY) && TEdge.at(edge.nextLocalMinima).isHorizontal) {
                edge = TEdge.at(this.updateEdgeIntoAEL(edge.current));

                if (edge.isAssigned) {
                    this.outRecManager.addOutPt(edge.current, edge.bot);
                }

                this.sortedEdges = edge.addEdgeToSEL(this.sortedEdges);
            } else {
                edge.curr.set(edge.topX(topY), topY);
            }

            if (strictlySimple && edge.canAddScanbeam()) {
                this.outRecManager.addScanbeamJoin(edge.current, edge.prevActive, edge.curr);
                //StrictlySimple (type-3) join
            }

            edgeIndex = edge.nextActive;
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.processHorizontals(true);
        //4. Promote intermediate vertices ...
        edgeIndex = this.activeEdges;

        while (edgeIndex !== UNASSIGNED) {
            let edge = TEdge.at(edgeIndex);

            if (edge.getIntermediate(topY)) {
                outPt1 = edge.isAssigned ? this.outRecManager.addOutPt(edgeIndex, edge.top) : UNASSIGNED;
                edge = TEdge.at(this.updateEdgeIntoAEL(edge.current));
                //if output polygons share an edge, they'll need joining later...
                const condition1 = edge.checkSharedCondition(outPt1, false, this.isUseFullRange);

                if (!this.outRecManager.insertJoin(condition1, outPt1, edge.prevActive,  edge.bot, edge.top)) {
                    const condition2 = edge.checkSharedCondition(outPt1, true, this.isUseFullRange);;
                    this.outRecManager.insertJoin(condition2, outPt1, edge.nextActive,  edge.bot, edge.top);
                }
            }

            edgeIndex = edge.nextActive;
        }
    }

    
    public checkMaxPair(edgeIndex: number, isNext: boolean): boolean {
        const currEdge = TEdge.at(edgeIndex);
        const index = isNext ? currEdge.next : currEdge.prev;
        const edge = TEdge.at(index);

        return index !== UNASSIGNED && edge.top.almostEqual(currEdge.top) && edge.nextLocalMinima === UNASSIGNED
    }

    public maximaPair(edge1Index: number): number {
        let result: number = UNASSIGNED;
        const edge1 = TEdge.at(edge1Index);

        if (this.checkMaxPair(edge1Index, true)) {
            result = edge1.next;
        } else if (this.checkMaxPair(edge1Index, false)) {
            result = edge1.prev;
        }

        const edge = TEdge.at(result);

        return result !== UNASSIGNED && edge.nextActive === edge.prevActive && !edge.isHorizontal ? UNASSIGNED : result;
    }


    private deleteFromActive(edgeIndex: number): void {
        const nextIndex = TEdge.getNeighboar(edgeIndex, true, true);
        const prevIndex = TEdge.getNeighboar(edgeIndex, false, true);
        const hasNext = nextIndex !== UNASSIGNED;
        const hasPrev = prevIndex !== UNASSIGNED;

        if (!hasPrev && !hasNext && edgeIndex !== this.activeEdges) {
            return;
        }

        //already deleted
        if (hasPrev) {
            TEdge.setNeighboar(prevIndex, true, true, nextIndex);
        } else {
            this.activeEdges = nextIndex;
        }

        if (hasNext) {
            TEdge.setNeighboar(nextIndex, false, true, prevIndex);
        }

        TEdge.setNeighboar(edgeIndex, true, true, UNASSIGNED);
        TEdge.setNeighboar(edgeIndex, false, true, UNASSIGNED);
    }


    private deleteFromSorted(edgeIndex: number): void {
        const nextIndex = TEdge.getNeighboar(edgeIndex, true, false);
        const prevIndex = TEdge.getNeighboar(edgeIndex, false, false);
        const hasNext = nextIndex !== UNASSIGNED;
        const hasPrev = prevIndex !== UNASSIGNED;

        if (!hasPrev && !hasNext && edgeIndex !== this.sortedEdges) {
            return;
        }

        //already deleted
        if (hasPrev) {
            TEdge.setNeighboar(prevIndex, true, false, nextIndex);
        } else {
            this.sortedEdges = nextIndex;
        }

        if (hasNext) {
            TEdge.setNeighboar(nextIndex, false, false, prevIndex);
        }

        TEdge.setNeighboar(edgeIndex, true, false, UNASSIGNED);
        TEdge.setNeighboar(edgeIndex, false, false, UNASSIGNED);
    }

    private doMaxima(edgeIndex: number): void {
        const edge = TEdge.at(edgeIndex);

        if (this.maximaPair(edgeIndex) === UNASSIGNED) {
            if (edge.isAssigned) {
                this.outRecManager.addOutPt(edgeIndex, edge.top);
            }

            this.deleteFromActive(edgeIndex);

            return;
        }

        let nextEdgeIndex: number = edge.nextActive;

        while (nextEdgeIndex !== UNASSIGNED && nextEdgeIndex !== this.maximaPair(edge.current)) {
            this.intersectEdges(edgeIndex, nextEdgeIndex, edge.top, true);
            this.swapPositionsInAEL(edgeIndex, nextEdgeIndex);
            nextEdgeIndex = edge.nextActive;
        }

        const maxPairEdge = TEdge.at(this.maximaPair(edge.current));

        if (!edge.isAssigned && !maxPairEdge.isAssigned) {
            this.deleteFromActive(edgeIndex);
            this.deleteFromActive(maxPairEdge.current);
        } else if (edge.isAssigned && maxPairEdge.isAssigned) {
            this.intersectEdges(edge.current, maxPairEdge.current, edge.top, false);
        } else if (edge.isWindDeletaEmpty) {
            if (edge.isAssigned) {
                this.outRecManager.addOutPt(edge.current, edge.top);
                edge.unassign();
            }

            this.deleteFromActive(edge.current);

            if (maxPairEdge.isAssigned) {
                this.outRecManager.addOutPt(maxPairEdge.current, edge.top);
                maxPairEdge.unassign();
            }

            this.deleteFromActive(maxPairEdge.current);
        } else {
            showError('DoMaxima error');
        }
    }

    public processIntersectList(): void {
        const intersectCount: number = this.intersections.length;
        let i: number = 0;
        const point = PointI32.create();

        for (i = 0; i < intersectCount; ++i) {
            const edge1Index: number = this.intersections.getEdge1Index(i);
            const edge2Index: number = this.intersections.getEdge2Index(i);
            point.set(this.intersections.getX(i), this.intersections.getY(i));

            this.intersectEdges(edge1Index, edge2Index, point, true);
            this.swapPositionsInAEL(edge1Index, edge2Index);
        }

        this.intersections.clean();
    }

    public processIntersections(botY: number, topY: number): boolean {
        if (this.activeEdges === UNASSIGNED) {
            return true;
        }

        try {
            this.buildIntersectList(botY, topY);

            if (this.intersections.isEmpty) {
                return true;
            }

            if (this.intersections.length === 1 || this.fixupIntersectionOrder()) {
                this.processIntersectList();
            } else {
                return false;
            }
        } catch (error) {
            this.sortedEdges = UNASSIGNED;
            this.intersections.clean();

            showError('ProcessIntersections error');
        }

        this.sortedEdges = UNASSIGNED;

        return true;
    }

    public insertLocalMinimaIntoAEL(botY: number): void {
        let outPt: number = UNASSIGNED;

        while (!Number.isNaN(this.localMinima.minY) && this.localMinima.minY === botY) {
            let [leftBoundIndex, rightBoundIndex] = this.localMinima.pop();
            const leftBound = TEdge.at(leftBoundIndex);
            const rightBound = TEdge.at(rightBoundIndex);
            outPt = UNASSIGNED;

            if (leftBoundIndex === UNASSIGNED) {
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges);
                rightBound.setWindingCount(this.activeEdges, this.clipType);

                if (rightBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(rightBoundIndex, rightBound.bot);
                }
            } else if (rightBoundIndex === UNASSIGNED) {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                leftBound.setWindingCount(this.activeEdges, this.clipType);

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(leftBoundIndex, leftBound.bot);
                }

                this.scanbeam.insert(leftBound.top.y);
            } else {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges, leftBoundIndex);
                leftBound.setWindingCount(this.activeEdges, this.clipType);
                rightBound.windCount1 = leftBound.windCount1;
                rightBound.windCount2 = leftBound.windCount2;

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addLocalMinPoly(leftBoundIndex, rightBoundIndex, leftBound.bot, this.isUseFullRange);
                }

                this.scanbeam.insert(leftBound.top.y);
            }

            if (rightBoundIndex !== UNASSIGNED) {
                if (rightBound.isHorizontal) {
                    this.sortedEdges = rightBound.addEdgeToSEL(this.sortedEdges);
                } else {
                    this.scanbeam.insert(rightBound.top.y);
                }
            }

            if (leftBoundIndex === UNASSIGNED || rightBoundIndex === UNASSIGNED) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            if(outPt !== UNASSIGNED && rightBound.isHorizontal && !rightBound.isWindDeletaEmpty) {
                this.outRecManager.addOutputJoins(outPt, rightBoundIndex);
            }
            
            const condition = leftBound.canJoinLeft(this.isUseFullRange);

            this.outRecManager.insertJoin(condition, outPt, leftBound.prevActive, leftBound.bot, leftBound.top);

            if (leftBound.nextActive !== rightBoundIndex) {
                const condition = rightBound.canJoinRight(this.isUseFullRange);

                this.outRecManager.insertJoin(condition, outPt, rightBound.prevActive, rightBound.bot, rightBound.top);

                if (leftBound.nextActive !== UNASSIGNED) {
                    let edgeIndex = leftBound.nextActive;

                    while (edgeIndex !== rightBoundIndex) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.intersectEdges(rightBoundIndex, edgeIndex, leftBound.curr, false);
                        //order important here
                        edgeIndex = TEdge.getNeighboar(edgeIndex, true, true);
                    }
                }
            }
        }
    }

    private createLocalMinima(edgeIndex: number): number {
        const currEdge = TEdge.at(edgeIndex);
        const prevEdge = TEdge.at(currEdge.prev);
        const isClockwise = currEdge.dx >= prevEdge.dx;
        const y = currEdge.bot.y;
        const leftBound = isClockwise ? currEdge : prevEdge;
        const rightBound = isClockwise ? prevEdge : currEdge;
        leftBound.side = DIRECTION.LEFT;
        rightBound.side = DIRECTION.RIGHT;
        leftBound.windDelta = leftBound.next === rightBound.current ? -1 : 1;
        rightBound.windDelta = -leftBound.windDelta;

        return this.localMinima.insert(y, leftBound.current, rightBound.current);
    }


    private processBound(index: number, isClockwise: boolean): number {
        let edge = TEdge.at(index);
        let result = edge;

        if (edge.isDxHorizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const neighboarIndex = this.getBaseNeighboar(index, !isClockwise);
            const neighboar = TEdge.at(neighboarIndex);

            if (edge.bot.x !== neighboar.bot.x) {
                edge.reverseHorizontal();
            }
        }

        let neighboarIndex = this.getBaseNeighboar(index, isClockwise);
        let neighboar = TEdge.at(neighboarIndex);
        
        while (result.top.y === neighboar.bot.y) {
            result = neighboar;
            neighboarIndex = this.getBaseNeighboar(neighboar.current, isClockwise);
            neighboar = TEdge.at(neighboarIndex);
        }

        if (result.isDxHorizontal) {
            //nb: at the top of a bound, horizontals are added to the bound
            //only when the preceding edge attaches to the horizontal's left vertex
            //unless a Skip edge is encountered when that becomes the top divide
            let horzNeighboarIndex = this.getBaseNeighboar(result.current, !isClockwise);
            let horzNeighboar = TEdge.at(horzNeighboarIndex);

            while (horzNeighboar.isDxHorizontal) {
                horzNeighboarIndex = this.getBaseNeighboar(horzNeighboar.current, !isClockwise);
                horzNeighboar = TEdge.at(horzNeighboarIndex);
            }

            const currNeighboarIndex = this.getBaseNeighboar(result.current, isClockwise);
            const currNeighboar = TEdge.at(currNeighboarIndex);

            if ((horzNeighboar.top.x === currNeighboar.top.x && !isClockwise) || horzNeighboar.top.x > currNeighboar.top.x) {
                result = horzNeighboar;
            }
        }

        while (edge !== result) {
            edge.nextLocalMinima = this.getBaseNeighboar(edge.current, isClockwise);

            if (this.checkReverseHorizontal(edge.current, index, !isClockwise)) {
                edge.reverseHorizontal();
            }

            edge = TEdge.at(edge.nextLocalMinima);
        }

        if (this.checkReverseHorizontal(edge.current, index, !isClockwise)) {
            edge.reverseHorizontal();
        }

        return this.getBaseNeighboar(result.current, isClockwise);
        //move to the edge just beyond current bound
    }

    private checkReverseHorizontal(edgeIndex: number, index: number, isNext: boolean): boolean {
        const edge = TEdge.at(edgeIndex);
        const neighboarIndex = this.getBaseNeighboar(edge.current, isNext);
        const neighboar = TEdge.at(neighboarIndex);

        return edge.isDxHorizontal && edge.current !== index && edge.bot.x !== neighboar.top.x;
    }

    private getBaseNeighboar(edgeIndex: number, isNext: boolean): number {
        const edge = TEdge.at(edgeIndex);
        return isNext ? edge.next : edge.prev;
    }
}