import { join_u16_to_u32, get_u16_from_u32 } from 'wasm-nesting';
import { Point } from 'src/types';
import { PointI32 } from '../geometry';
import { UNASSIGNED } from './constants';
import { showError } from './helpers';
import IntersectNode from './intersect-node';
import LocalMinima from './local-minima';
import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from './types';
import Join from './join';
import OutRec from './out-rec';

export default class Clipper {
    private localMinima: LocalMinima;
    private intersections: IntersectNode;
    private scanbeam: Scanbeam;
    private tEdge: TEdge;
    private join: Join;
    private outRec: OutRec;
    private isExecuteLocked: boolean = false;

    constructor(reverseSolution: boolean, strictlySimple: boolean) {
        this.intersections = new IntersectNode();
        this.localMinima = new LocalMinima();
        this.scanbeam = new Scanbeam();
        this.tEdge = new TEdge();
        this.join = new Join();
        this.outRec = new OutRec(reverseSolution, strictlySimple);
    }

    public addPath(polygon: PointI32[], polyType: POLY_TYPE): boolean {
        let edgeIndex = this.tEdge.createPath(polygon, polyType);

        if (edgeIndex === UNASSIGNED) {
            return false;
        }

        let minIndex: number = UNASSIGNED;

        while (true) {
            edgeIndex = this.tEdge.findNextLocMin(edgeIndex);

            if (edgeIndex === minIndex) {
                break;
            }

            if (minIndex === UNASSIGNED) {
                minIndex = edgeIndex;
            }

            const [y, leftBound, rightBound] = this.tEdge.createLocalMinima(edgeIndex);
            const localMinima = this.localMinima.insert(y, leftBound, rightBound);

            edgeIndex = this.tEdge.processBounds(
                edgeIndex,
                this.localMinima.getLeftBound(localMinima),
                this.localMinima.getRightBound(localMinima)
            );
        }

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
        this.tEdge.init(clipType, fillType);

        solution.length = 0;

        let succeeded: boolean = false;

        try {
            succeeded = this.executeInternal();
            //build the return polygons ...
            if (succeeded) {
                this.buildResult(solution);
            }
        } finally {
            this.dispose();
            this.tEdge.dispose();
            this.isExecuteLocked = false;
        }

        return succeeded;
    }

    private executeInternal(): boolean {
        try {
            this.reset();

            if (this.localMinima.isEmpty) {
                return false;
            }

            let botY: number = this.scanbeam.pop();
            let topY: number = 0;

            do {
                this.insertLocalMinimaIntoAEL(botY);
                this.clearGhostJoins();
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
            } while (!this.scanbeam.isEmpty || !this.localMinima.isEmpty);

            this.fixupOutPolygon();

            return true;
        } finally {
            this.join.reset();
        }
    }

    protected reset(): void {
        this.scanbeam.clean();

        const minimaCount = this.localMinima.length;

        for (let i = 0; i < minimaCount; ++i) {
            const leftBound = this.localMinima.getLeftBound(i);
            const rightBound = this.localMinima.getRightBound(i);
            const y = this.localMinima.getY(i);

            this.tEdge.resetBounds(leftBound, rightBound);

            this.scanbeam.insert(y);
        }

        this.tEdge.reset();
    }

    public updateEdgeIntoAEL(edgeIndex: number): number {
        const result = this.tEdge.updateEdgeIntoAEL(edgeIndex);

        if (!this.tEdge.isHorizontal(result)) {
            this.scanbeam.insert(this.tEdge.top(result).y);
        }

        return result;
    }

    public buildIntersectList(botY: number, topY: number): void {
        if (!this.tEdge.prepareForIntersections(topY)) {
            return;
        }

        //bubblesort ...
        let isModified: boolean = true;
        const point: PointI32 = PointI32.create();

        while (isModified && this.tEdge.sorted !== UNASSIGNED) {
            isModified = false;
            let currIndex = this.tEdge.sorted;

            while (this.tEdge.nextSorted(currIndex) !== UNASSIGNED) {
                const nextIndex = this.tEdge.nextSorted(currIndex);

                point.set(0, 0);
                //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
                if (this.tEdge.curr(currIndex).x > this.tEdge.curr(nextIndex).x) {
                    if (this.tEdge.getIntersectError(currIndex, nextIndex, point)) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.set(this.tEdge.getIntersectX(currIndex, nextIndex, botY), botY);
                    }

                    this.intersections.add(currIndex, nextIndex, point);
                    this.tEdge.swapPositionsInList(currIndex, nextIndex, false);
                    isModified = true;
                } else {
                    currIndex = nextIndex;
                }
            }

            const prevIndex = this.tEdge.prevSorted(currIndex);

            if (prevIndex === UNASSIGNED) {
                break;
            }

            this.tEdge.setNeighboar(prevIndex, true, false, UNASSIGNED);
        }

        this.tEdge.sorted = UNASSIGNED;
    }

    public intersectEdges(edge1Index: number, edge2Index: number, point: Point<Int32Array>, isProtect: boolean): void {
        //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
        //e2 in AEL except when e1 is being inserted at the intersection point ...
        const edge1Stops: boolean = this.tEdge.getStop(edge1Index, point, isProtect);
        const edge2Stops: boolean = this.tEdge.getStop(edge2Index, point, isProtect);
        const edge1Contributing: boolean = this.tEdge.isAssigned(edge1Index);
        const edge2Contributing: boolean = this.tEdge.isAssigned(edge2Index);

        //if either edge is on an OPEN path ...
        if (this.tEdge.isWindDeletaEmpty(edge1Index) || this.tEdge.isWindDeletaEmpty(edge2Index)) {
            //ignore subject-subject open path intersections UNLESS they
            //are both open paths, AND they are both 'contributing maximas' ...
            this.intersectOpenEdges(edge1Index, edge2Index, isProtect, point);
            return;
        }

        //update winding counts...
        //assumes that e1 will be to the Right of e2 ABOVE the intersection
        this.tEdge.alignWndCount(edge1Index, edge2Index);

        const e1Wc: number = this.tEdge.getWndTypeFilled(edge1Index);
        const e2Wc: number = this.tEdge.getWndTypeFilled(edge2Index);

        if (edge1Contributing && edge2Contributing) {
            if (
                edge1Stops ||
                edge2Stops ||
                (e1Wc !== 0 && e1Wc !== 1) ||
                (e2Wc !== 0 && e2Wc !== 1) ||
                !this.tEdge.isSamePolyType(edge1Index, edge2Index)
            ) {
                this.addLocalMaxPoly(edge1Index, edge2Index, point);
            } else {
                this.addOutPt(edge1Index, point);
                this.addOutPt(edge2Index, point);
                this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                this.addOutPt(edge1Index, point);
                this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                this.addOutPt(edge2Index, point);
                this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            if (this.tEdge.swapEdges(e1Wc, e2Wc, edge1Index, edge2Index)) {
                this.addLocalMinPoly(edge1Index, edge2Index, point);
            }
        }
        if (
            edge1Stops !== edge2Stops &&
            ((edge1Stops && this.tEdge.isAssigned(edge1Index)) || (edge2Stops && this.tEdge.isAssigned(edge2Index)))
        ) {
            this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
        }
        //finally, delete any non-contributing maxima edges  ...
        if (edge1Stops) {
            this.tEdge.deleteFromList(edge1Index, true);
        }

        if (edge2Stops) {
            this.tEdge.deleteFromList(edge2Index, true);
        }
    }

    public edgesAdjacent(nodeIndex: number): boolean {
        const edge1Index = this.intersections.getEdge1Index(nodeIndex);
        const edge2Index = this.intersections.getEdge2Index(nodeIndex);

        return (
            this.tEdge.getNeighboar(edge1Index, true, false) === edge2Index ||
            this.tEdge.getNeighboar(edge1Index, false, false) === edge2Index
        );
    }

    public fixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.intersections.sort();

        this.tEdge.copyAELToSEL();

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

            this.tEdge.swapPositionsInList(this.intersections.getEdge1Index(i), this.intersections.getEdge2Index(i), false);
        }

        return true;
    }

    public intersectOpenEdges(edge1Index: number, edge2Index: number, isProtect: boolean, point: Point<Int32Array>) {
        const edge1Stops: boolean =
            !isProtect && !this.tEdge.hasNextLocalMinima(edge1Index) && this.tEdge.top(edge1Index).almostEqual(point);
        const edge2Stops: boolean =
            !isProtect && !this.tEdge.hasNextLocalMinima(edge2Index) && this.tEdge.top(edge2Index).almostEqual(point);
        const edge1Contributing: boolean = this.tEdge.isAssigned(edge1Index);
        const edge2Contributing: boolean = this.tEdge.isAssigned(edge2Index);
        //ignore subject-subject open path intersections UNLESS they
        //are both open paths, AND they are both 'contributing maximas' ...
        if (this.tEdge.isWindDeletaEmpty(edge1Index) && this.tEdge.isWindDeletaEmpty(edge2Index)) {
            if ((edge1Stops || edge2Stops) && edge1Contributing && edge2Contributing) {
                this.addLocalMaxPoly(edge1Index, edge2Index, point);
            }
        }
        //if intersecting a subj line with a subj poly ...
        else if (this.tEdge.intersectLineWithPoly(edge1Index, edge2Index)) {
            if (this.tEdge.isWindDeletaEmpty(edge1Index)) {
                if (edge2Contributing) {
                    this.addOutPt(edge1Index, point);

                    if (edge1Contributing) {
                        this.tEdge.unassign(edge1Index);
                    }
                }
            } else {
                if (edge1Contributing) {
                    this.addOutPt(edge2Index, point);

                    if (edge2Contributing) {
                        this.tEdge.unassign(edge2Index);
                    }
                }
            }
        } else if (!this.tEdge.isSamePolyType(edge1Index, edge2Index)) {
            if (this.tEdge.intersectLine(edge1Index, edge2Index)) {
                this.addOutPt(edge1Index, point);

                if (edge1Contributing) {
                    this.tEdge.unassign(edge1Index);
                }
            } else if (this.tEdge.intersectLine(edge2Index, edge1Index)) {
                this.addOutPt(edge2Index, point);

                if (edge2Contributing) {
                    this.tEdge.unassign(edge2Index);
                }
            }
        }

        if (edge1Stops) {
            if (!this.tEdge.isAssigned(edge1Index)) {
                this.tEdge.deleteFromList(edge1Index, true);
            } else {
                showError('Error intersecting polylines');
            }
        }

        if (edge2Stops) {
            if (!this.tEdge.isAssigned(edge2Index)) {
                this.tEdge.deleteFromList(edge2Index, true);
            } else {
                showError('Error intersecting polylines');
            }
        }
    }

    public processHorizontal(horzEdgeIndex: number, isTopOfScanbeam: boolean) {
        let dirValue: Float64Array = this.tEdge.horzDirection(horzEdgeIndex);
        let dir: DIRECTION = dirValue[0] as DIRECTION;
        let horzLeft: number = dirValue[1];
        let horzRight: number = dirValue[2];
        const lastHorzIndex = this.tEdge.getLastHorizontal(horzEdgeIndex);
        const maxPairIndex = this.tEdge.getMaxPair(lastHorzIndex);
        let horzIndex = horzEdgeIndex;

        while (true) {
            const isLastHorz: boolean = horzIndex === lastHorzIndex;
            let currIndex = this.tEdge.getNeighboar(horzIndex, dir === DIRECTION.RIGHT, true);
            let nextIndex = UNASSIGNED;

            while (currIndex !== UNASSIGNED) {
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (
                    this.tEdge.curr(currIndex).x === this.tEdge.top(horzIndex).x &&
                    this.tEdge.hasNextLocalMinima(horzIndex) &&
                    this.tEdge.dx(currIndex) < this.tEdge.dx(this.tEdge.getNextLocalMinima(horzIndex))
                ) {
                    break;
                }

                nextIndex = this.tEdge.getNeighboar(currIndex, dir === DIRECTION.RIGHT, true);
                //saves eNext for later
                if (
                    (dir === DIRECTION.RIGHT && this.tEdge.curr(currIndex).x <= horzRight) ||
                    (dir === DIRECTION.LEFT && this.tEdge.curr(currIndex).x >= horzLeft)
                ) {
                    if (this.tEdge.isFilled(horzIndex) && isTopOfScanbeam) {
                        this.prepareHorzJoins(horzIndex);
                    }

                    //so far we're still in range of the horizontal Edge  but make sure
                    //we're at the last of consec. horizontals when matching with eMaxPair
                    if (currIndex === maxPairIndex && isLastHorz) {
                        const index1 = dir === DIRECTION.RIGHT ? horzIndex : currIndex;
                        const index2 = dir === DIRECTION.RIGHT ? currIndex : horzIndex;

                        this.intersectEdges(index1, index2, this.tEdge.top(currIndex), false);

                        if (this.tEdge.isAssigned(maxPairIndex)) {
                            showError('ProcessHorizontal error');
                        }

                        return;
                    }

                    const point = PointI32.from(this.tEdge.curr(currIndex));
                    const index1 = dir === DIRECTION.RIGHT ? horzIndex : currIndex;
                    const index2 = dir === DIRECTION.RIGHT ? currIndex : horzIndex;

                    this.intersectEdges(index1, index2, point, true);

                    this.tEdge.swapPositionsInList(horzIndex, currIndex, true);
                } else if (
                    (dir === DIRECTION.RIGHT && this.tEdge.curr(currIndex).x >= horzRight) ||
                    (dir === DIRECTION.LEFT && this.tEdge.curr(currIndex).x <= horzLeft)
                ) {
                    break;
                }

                currIndex = nextIndex;
            }
            //end while
            if (this.tEdge.isFilled(horzEdgeIndex) && isTopOfScanbeam) {
                this.prepareHorzJoins(horzIndex);
            }

            if (this.tEdge.hasNextLocalMinima(horzIndex) && this.tEdge.isHorizontal(this.tEdge.getNextLocalMinima(horzIndex))) {
                horzIndex = this.updateEdgeIntoAEL(horzIndex);

                if (this.tEdge.isAssigned(horzIndex)) {
                    this.addOutPt(horzIndex, this.tEdge.bot(horzIndex));
                }

                dirValue = this.tEdge.horzDirection(horzIndex);
                dir = dirValue[0] as DIRECTION;
                horzLeft = dirValue[1];
                horzRight = dirValue[2];
            } else {
                break;
            }
        }

        //end for (;;)
        if (this.tEdge.hasNextLocalMinima(horzIndex)) {
            if (this.tEdge.isAssigned(horzIndex)) {
                const op1 = this.addOutPt(horzIndex, this.tEdge.top(horzIndex));
                horzIndex = this.updateEdgeIntoAEL(horzIndex);

                if (this.tEdge.isWindDeletaEmpty(horzIndex)) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                const condition1 = this.tEdge.checkHorizontalCondition(horzIndex, false);

                this.insertJoin(condition1, op1, this.tEdge.prevActive(horzIndex), this.tEdge.bot(horzIndex));

                if (!condition1) {
                    const condition2 = this.tEdge.checkHorizontalCondition(horzIndex, true);

                    this.insertJoin(condition2, op1, this.tEdge.nextActive(horzIndex), this.tEdge.bot(horzIndex));
                }

                return;
            }

            this.updateEdgeIntoAEL(horzIndex);

            return;
        }

        if (maxPairIndex !== UNASSIGNED) {
            if (this.tEdge.isAssigned(maxPairIndex)) {
                const index1 = dir === DIRECTION.RIGHT ? horzIndex : maxPairIndex;
                const index2 = dir === DIRECTION.RIGHT ? maxPairIndex : horzIndex;

                this.intersectEdges(index1, index2, this.tEdge.top(horzIndex), false);

                if (this.tEdge.isAssigned(maxPairIndex)) {
                    showError('ProcessHorizontal error');
                }

                return;
            }

            this.tEdge.deleteFromList(horzIndex, true);
            this.tEdge.deleteFromList(maxPairIndex, true);

            return;
        }

        if (this.tEdge.isAssigned(horzIndex)) {
            this.addOutPt(horzIndex, this.tEdge.top(horzIndex));
        }

        this.tEdge.deleteFromList(horzIndex, true);
    }

    public processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdgeIndex = this.tEdge.sorted;

        while (horzEdgeIndex !== UNASSIGNED) {
            this.tEdge.deleteFromList(horzEdgeIndex, false);

            this.processHorizontal(horzEdgeIndex, isTopOfScanbeam);

            horzEdgeIndex = this.tEdge.sorted;
        }
    }

    public processEdgesAtTopOfScanbeam(topY: number): void {
        let isMaximaEdge: boolean = false;
        let outPt1: number = UNASSIGNED;
        let edgeIndex: number = this.tEdge.active;

        while (edgeIndex !== UNASSIGNED) {
            //1. process maxima, treating them as if they're 'bent' horizontal edges,
            //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
            isMaximaEdge = this.tEdge.getMaxima(edgeIndex, topY);

            if (isMaximaEdge) {
                const tempEdgeIndex = this.tEdge.maximaPair(edgeIndex);
                isMaximaEdge = tempEdgeIndex === UNASSIGNED || !this.tEdge.isHorizontal(tempEdgeIndex);
            }

            if (isMaximaEdge) {
                const prevIndex = this.tEdge.prevActive(edgeIndex);
                this.doMaxima(edgeIndex);

                edgeIndex =
                    this.tEdge.prevActive(edgeIndex) === UNASSIGNED ? this.tEdge.active : this.tEdge.nextActive(prevIndex);
                continue;
            }

            //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
            if (
                this.tEdge.getIntermediate(edgeIndex, topY) &&
                this.tEdge.isHorizontal(this.tEdge.getNextLocalMinima(edgeIndex))
            ) {
                edgeIndex = this.updateEdgeIntoAEL(edgeIndex);

                if (this.tEdge.isAssigned(edgeIndex)) {
                    this.addOutPt(edgeIndex, this.tEdge.bot(edgeIndex));
                }

                this.tEdge.addEdgeToSEL(edgeIndex);
            } else {
                this.tEdge.curr(edgeIndex).set(this.tEdge.topX(edgeIndex, topY), topY);
            }

            if (this.outRec.strictlySimple && this.tEdge.canAddScanbeam(edgeIndex)) {
                this.addScanbeamJoin(edgeIndex, this.tEdge.prevActive(edgeIndex), this.tEdge.curr(edgeIndex));
                //StrictlySimple (type-3) join
            }

            edgeIndex = this.tEdge.nextActive(edgeIndex);
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.processHorizontals(true);
        //4. Promote intermediate vertices ...
        edgeIndex = this.tEdge.active;

        while (edgeIndex !== UNASSIGNED) {
            if (this.tEdge.getIntermediate(edgeIndex, topY)) {
                outPt1 = this.tEdge.isAssigned(edgeIndex)
                    ? this.addOutPt(edgeIndex, this.tEdge.top(edgeIndex))
                    : UNASSIGNED;
                edgeIndex = this.updateEdgeIntoAEL(edgeIndex);
                //if output polygons share an edge, they'll need joining later...
                const condition1 = this.tEdge.checkSharedCondition(edgeIndex, outPt1, false);

                if (
                    !this.insertJoin(
                        condition1,
                        outPt1,
                        this.tEdge.prevActive(edgeIndex),
                        this.tEdge.bot(edgeIndex),
                        this.tEdge.top(edgeIndex)
                    )
                ) {
                    const condition2 = this.tEdge.checkSharedCondition(edgeIndex, outPt1, true);
                    this.insertJoin(
                        condition2,
                        outPt1,
                        this.tEdge.nextActive(edgeIndex),
                        this.tEdge.bot(edgeIndex),
                        this.tEdge.top(edgeIndex)
                    );
                }
            }

            edgeIndex = this.tEdge.nextActive(edgeIndex);
        }
    }

    private doMaxima(edgeIndex: number): void {
        if (this.tEdge.maximaPair(edgeIndex) === UNASSIGNED) {
            if (this.tEdge.isAssigned(edgeIndex)) {
                this.addOutPt(edgeIndex, this.tEdge.top(edgeIndex));
            }

            this.tEdge.deleteFromList(edgeIndex, true);

            return;
        }

        let nextEdgeIndex: number = this.tEdge.nextActive(edgeIndex);

        while (nextEdgeIndex !== UNASSIGNED && nextEdgeIndex !== this.tEdge.maximaPair(edgeIndex)) {
            this.intersectEdges(edgeIndex, nextEdgeIndex, this.tEdge.top(edgeIndex), true);
            this.tEdge.swapPositionsInList(edgeIndex, nextEdgeIndex, true);
            nextEdgeIndex = this.tEdge.nextActive(edgeIndex);
        }

        const maxIndex = this.tEdge.maximaPair(edgeIndex);

        if (!this.tEdge.isAssigned(edgeIndex) && !this.tEdge.isAssigned(maxIndex)) {
            this.tEdge.deleteFromList(edgeIndex, true);
            this.tEdge.deleteFromList(maxIndex, true);
        } else if (this.tEdge.isAssigned(edgeIndex) && this.tEdge.isAssigned(maxIndex)) {
            this.intersectEdges(edgeIndex, maxIndex, this.tEdge.top(edgeIndex), false);
        } else if (this.tEdge.isWindDeletaEmpty(edgeIndex)) {
            if (this.tEdge.isAssigned(edgeIndex)) {
                this.addOutPt(edgeIndex, this.tEdge.top(edgeIndex));
                this.tEdge.unassign(edgeIndex);
            }

            this.tEdge.deleteFromList(edgeIndex, true);

            if (this.tEdge.isAssigned(maxIndex)) {
                this.addOutPt(maxIndex, this.tEdge.top(edgeIndex));
                this.tEdge.unassign(maxIndex);
            }

            this.tEdge.deleteFromList(maxIndex, true);
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
            this.tEdge.swapPositionsInList(edge1Index, edge2Index, true);
        }

        this.intersections.clean();
    }

    public processIntersections(botY: number, topY: number): boolean {
        if (this.tEdge.active === UNASSIGNED) {
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
            this.tEdge.sorted = UNASSIGNED;
            this.intersections.clean();

            showError('ProcessIntersections error');
        }

        this.tEdge.sorted = UNASSIGNED;

        return true;
    }

    public insertLocalMinimaIntoAEL(botY: number): void {
        let outPt: number = UNASSIGNED;

        while (!Number.isNaN(this.localMinima.minY) && this.localMinima.minY === botY) {
            let [leftBoundIndex, rightBoundIndex] = this.localMinima.pop();
            outPt = UNASSIGNED;

            if (leftBoundIndex === UNASSIGNED) {
                this.tEdge.insertEdgeIntoAEL(rightBoundIndex);
                this.tEdge.setWindingCount(rightBoundIndex);

                if (this.tEdge.getContributing(rightBoundIndex)) {
                    outPt = this.addOutPt(rightBoundIndex, this.tEdge.bot(rightBoundIndex));
                }
            } else if (rightBoundIndex === UNASSIGNED) {
                this.tEdge.insertEdgeIntoAEL(leftBoundIndex);
                this.tEdge.setWindingCount(leftBoundIndex);

                if (this.tEdge.getContributing(leftBoundIndex)) {
                    outPt = this.addOutPt(leftBoundIndex, this.tEdge.bot(leftBoundIndex));
                }

                this.scanbeam.insert(this.tEdge.top(leftBoundIndex).y);
            } else {
                this.tEdge.insertEdgeIntoAEL(leftBoundIndex);
                this.tEdge.insertEdgeIntoAEL(rightBoundIndex, leftBoundIndex);
                this.tEdge.setWindingCount(leftBoundIndex);
                this.tEdge.setWindCount1(rightBoundIndex, this.tEdge.windCount1(leftBoundIndex));
                this.tEdge.setWindCount2(rightBoundIndex, this.tEdge.windCount2(leftBoundIndex));

                if (this.tEdge.getContributing(leftBoundIndex)) {
                    outPt = this.addLocalMinPoly(leftBoundIndex, rightBoundIndex, this.tEdge.bot(leftBoundIndex));
                }

                this.scanbeam.insert(this.tEdge.top(leftBoundIndex).y);
            }

            if (rightBoundIndex !== UNASSIGNED) {
                if (this.tEdge.isHorizontal(rightBoundIndex)) {
                    this.tEdge.addEdgeToSEL(rightBoundIndex);
                } else {
                    this.scanbeam.insert(this.tEdge.top(rightBoundIndex).y);
                }
            }

            if (leftBoundIndex === UNASSIGNED || rightBoundIndex === UNASSIGNED) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            if (
                outPt !== UNASSIGNED &&
                this.tEdge.isHorizontal(rightBoundIndex) &&
                !this.tEdge.isWindDeletaEmpty(rightBoundIndex)
            ) {
                this.addOutputJoins(outPt, rightBoundIndex);
            }

            const condition = this.tEdge.canJoinLeft(leftBoundIndex);

            this.insertJoin(
                condition,
                outPt,
                this.tEdge.prevActive(leftBoundIndex),
                this.tEdge.bot(leftBoundIndex),
                this.tEdge.top(leftBoundIndex)
            );

            if (this.tEdge.nextActive(leftBoundIndex) !== rightBoundIndex) {
                const condition = this.tEdge.canJoinRight(rightBoundIndex);

                this.insertJoin(
                    condition,
                    outPt,
                    this.tEdge.prevActive(rightBoundIndex),
                    this.tEdge.bot(rightBoundIndex),
                    this.tEdge.top(rightBoundIndex)
                );

                if (this.tEdge.nextActive(leftBoundIndex) !== UNASSIGNED) {
                    let edgeIndex = this.tEdge.nextActive(leftBoundIndex);

                    while (edgeIndex !== rightBoundIndex) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.intersectEdges(rightBoundIndex, edgeIndex, this.tEdge.curr(leftBoundIndex), false);
                        //order important here
                        edgeIndex = this.tEdge.getNeighboar(edgeIndex, true, true);
                    }
                }
            }
        }
    }

    public insertJoin(
        condition: boolean,
        outHash1: number,
        edgeIndex: number,
        point1: Point<Int32Array>,
        point2: Point<Int32Array> = point1
    ): boolean {
        if (condition) {
            const outHash2 = this.addOutPt(edgeIndex, point1);
            this.join.add(outHash1, outHash2, point2);
        }

        return condition;
    }

    public addScanbeamJoin(edge1Index: number, edge2Index: number, point: Point<Int32Array>): void {
        const outPt1 = this.addOutPt(edge2Index, point);
        const outPt2 = this.addOutPt(edge1Index, point);

        this.join.add(outPt1, outPt2, point);
        //StrictlySimple (type-3) join
    }

    public addOutputJoins(outHash: number, rightBoundIndex: number): void {
        const joinCount: number = this.join.getLength(true);

        if (joinCount > 0) {
            const point = PointI32.create();

            for (let i = 0; i < joinCount; ++i) {
                //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
                //the 'ghost' join to a real join ready for later ...
                point.set(this.join.getX(i, true), this.join.getY(i, true));

                if (this.horzSegmentsOverlap(this.join.getHash1(i, true), point, rightBoundIndex)) {
                    this.join.fromGhost(i, outHash);
                }
            }
        }
    }

    public prepareHorzJoins(horzEdgeIndex: number) {
        //Also, since horizontal edges at the top of one SB are often removed from
        //the AEL before we process the horizontal edges at the bottom of the next,
        //we need to create 'ghost' Join records of 'contrubuting' horizontals that
        //we can compare with horizontals at the bottom of the next SB.
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const [outPtHash, x, y] = this.getJoinData(horzEdgeIndex);

        this.join.addGhost(outPtHash, x, y);
    }

    public clearGhostJoins() {
        this.join.clearGhosts();
    }

    public addOutPt(edgeIndex: number, point: Point<Int32Array>): number {
        let outRecIndex: number;
        let pointIndex: number;

        if (!this.tEdge.isAssigned(edgeIndex)) {
            pointIndex = this.outRec.fromPoint(point);

            outRecIndex = this.outRec.create(pointIndex);

            this.setHoleState(outRecIndex, edgeIndex);

            this.tEdge.setRecIndex(edgeIndex, this.outRec.currentIndex(outRecIndex));
            //nb: do this after SetZ !
        } else {
            const isToFront: boolean = this.tEdge.side(edgeIndex) === DIRECTION.LEFT;
            const recIndex = this.tEdge.getRecIndex(edgeIndex);
            outRecIndex = this.outRec.getOutRec(recIndex);

            pointIndex = this.outRec.addOutPt(recIndex, isToFront, point);
        }

        return this.outRec.getHash(outRecIndex, pointIndex);
    }

    public addLocalMinPoly(edge1Index: number, edge2Index: number, point: Point<Int32Array>): number {
        let firstIndex = edge2Index;
        let secondIndex = edge1Index;
        let result: number = UNASSIGNED;

        if (this.tEdge.isHorizontal(edge2Index) || this.tEdge.dx(edge1Index) > this.tEdge.dx(edge2Index)) {
            firstIndex = edge1Index;
            secondIndex = edge2Index;
        }

        result = this.addOutPt(firstIndex, point);
        this.tEdge.setRecIndex(secondIndex, this.tEdge.getRecIndex(firstIndex));
        this.tEdge.setSide(secondIndex, DIRECTION.RIGHT);
        this.tEdge.setSide(firstIndex, DIRECTION.LEFT);

        const prevIndex =
            this.tEdge.prevActive(firstIndex) === secondIndex
                ? this.tEdge.prevActive(secondIndex)
                : this.tEdge.prevActive(firstIndex);
        const condition = this.tEdge.checkMinJoin(firstIndex, prevIndex, point);

        this.insertJoin(condition, result, prevIndex, point, this.tEdge.top(firstIndex));

        return result;
    }

    public addLocalMaxPoly(edge1Index: number, edge2Index: number, point: Point<Int32Array>): void {
        this.addOutPt(edge1Index, point);

        if (this.tEdge.isWindDeletaEmpty(edge2Index)) {
            this.addOutPt(edge2Index, point);
        }

        const recIndex1 = this.tEdge.getRecIndex(edge1Index);
        const recIndex2 = this.tEdge.getRecIndex(edge2Index);

        if (recIndex1 === recIndex2) {
            this.tEdge.unassign(edge1Index);
            this.tEdge.unassign(edge2Index);
            return;
        }

        const condition = recIndex1 < recIndex2;
        const firstIndex = condition ? edge1Index : edge2Index;
        const secondIndex = condition ? edge2Index : edge1Index;
        const firstRecIndex = this.tEdge.getRecIndex(firstIndex);
        const secondRecIndex = this.tEdge.getRecIndex(secondIndex);

        //get the start and ends of both output polygons ...
        const firstSide = this.tEdge.side(firstIndex);
        const secondSide = this.tEdge.side(secondIndex);

        this.outRec.joinPolys(firstRecIndex, secondRecIndex, firstSide, secondSide);

        const OKIdx: number = this.tEdge.getRecIndex(firstIndex);
        const ObsoleteIdx: number = this.tEdge.getRecIndex(secondIndex);
        this.tEdge.unassign(firstIndex);
        //nb: safe because we only get here via AddLocalMaxPoly
        this.tEdge.unassign(secondIndex);

        this.tEdge.updateIndexAEL(firstSide, ObsoleteIdx, OKIdx);

        this.outRec.setCurrentIndex(secondRecIndex, firstRecIndex);
    }

    public fixupOutPolygon(): void {
        let i: number = 0;

        this.outRec.fixDirections();

        const joinCount: number = this.join.getLength(false);
        const point = PointI32.create();

        for (i = 0; i < joinCount; ++i) {
            point.set(this.join.getX(i, false), this.join.getY(i, false));
            this.joinCommonEdge(i, point);
        }

        this.outRec.fixOutPolygon(this.tEdge.isUseFullRange);
    }

    public buildResult(polygons: Point<Int32Array>[][]): void {
        return this.outRec.buildResult(polygons);
    }

    public dispose(): void {
        this.outRec.dispose();
    }

    private getJoinData(index: number) {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        const recIndex = this.tEdge.getRecIndex(index);
        const side = this.tEdge.side(index);
        const top = this.tEdge.top(index);
        const bot = this.tEdge.bot(index);

        return this.outRec.getJoinData(recIndex, side, top, bot);
    }

    private setHoleState(recIndex: number, edgeIndex: number): void {
        const { isHole, index } = this.tEdge.getHoleState(this.outRec.firstLeftIndex(recIndex), edgeIndex);

        this.outRec.setHoleState(recIndex, isHole, index);
    }

    private joinCommonEdge(index: number, offPoint: Point<Int32Array>): void {
        const inputHash1 = this.join.getHash1(index, false);
        const inputHash2 = this.join.getHash2(index);
        const { outHash1, outHash2, result } = this.joinPoints(inputHash1, inputHash2, offPoint);

        if (!result) {
            this.join.updateHash(index, outHash1, outHash2);
            return;
        }

        //get the polygon fragment with the correct hole state (FirstLeft)
        //before calling JoinPoints() ...

        const index1: number = get_u16_from_u32(outHash1, 0);
        const index2: number = get_u16_from_u32(outHash2, 0);
        const outPt1Index: number = get_u16_from_u32(outHash1, 1);
        const outPt2Index: number = get_u16_from_u32(outHash2, 1);
        const outRec1: number = this.outRec.getOutRec(index1);
        let outRec2: number = this.outRec.getOutRec(index2);

        if (index1 === index2) {
            //instead of joining two polygons, we've just created a new one by
            //splitting one polygon into two.
            outRec2 = this.outRec.splitPolys(outRec1, outPt1Index, outPt2Index);

            this.join.updateHash(index, outHash1, outHash2);
            return;
        }

        this.outRec.joinPolys2(outRec1, outRec2);

        this.join.updateHash(index, outHash1, outHash2);
    }

    private joinPoints(
        outHash1: number,
        outHash2: number,
        offPoint: Point<Int32Array>
    ): { outHash1: number; outHash2: number; result: boolean } {
        const index1: number = get_u16_from_u32(outHash1, 0);
        const index2: number = get_u16_from_u32(outHash2, 0);
        const outRec1 = this.outRec.getOutRec(index1);
        const outRec2 = this.outRec.getOutRec(index2);
        const result = { outHash1, outHash2, result: false };

        if (this.outRec.isUnassigned(outRec1) || this.outRec.isUnassigned(outRec2)) {
            return result;
        }

        const outPt1Index: number = get_u16_from_u32(outHash1, 1);
        const outPt2Index: number = get_u16_from_u32(outHash2, 1);
        const isRecordsSame = outRec1 === outRec2;
        //There are 3 kinds of joins for output polygons ...
        //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
        //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
        //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
        //location at the Bottom of the overlapping segment (& Join.OffPt is above).
        //3. StrictlySimple joins where edges touch but are not collinear and where
        //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
        const isHorizontal: boolean = this.outRec.point(outPt1Index).y === offPoint.y;

        if (
            isHorizontal &&
            offPoint.almostEqual(this.outRec.point(outPt1Index)) &&
            offPoint.almostEqual(this.outRec.point(outPt2Index))
        ) {
            //Strictly Simple join ...
            const reverse1 = this.outRec.strictlySimpleJoin(outPt1Index, offPoint);
            const reverse2 = this.outRec.strictlySimpleJoin(outPt2Index, offPoint);

            if (reverse1 === reverse2) {
                return result;
            }

            result.outHash2 = join_u16_to_u32(index2, this.outRec.applyJoin(outPt1Index, outPt2Index, reverse1));
            result.result = true;

            return result;
        }

        if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            const outPt1Res = this.outRec.flatHorizontal(outPt1Index, outPt2Index, outPt2Index);

            if (outPt1Res.length === 0) {
                return result;
            }

            const [op1Index, op1bIndex] = outPt1Res;
            //a flat 'polygon'
            const outPt2Res = this.outRec.flatHorizontal(outPt2Index, op1Index, op1bIndex);

            if (outPt2Res.length === 0) {
                return result;
            }

            const [op2Index, op2bIndex] = outPt2Res;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value = PointI32.getOverlap(
                this.outRec.pointX(op1Index),
                this.outRec.pointX(op1bIndex),
                this.outRec.pointX(op2Index),
                this.outRec.pointX(op2bIndex)
            );
            const isOverlapped = value.x < value.y;

            if (!isOverlapped) {
                return result;
            }

            //DiscardLeftSide: when overlapping edges are joined, a spike will created
            //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
            //on the discard Side as either may still be needed for other joins ...
            result.outHash1 = join_u16_to_u32(index1, op1Index);
            result.outHash2 = join_u16_to_u32(index2, op2Index);
            result.result = this.outRec.joinHorz(op1Index, op1bIndex, op2Index, op2bIndex, value);

            return result;
        }

        let op1 = outPt1Index;
        let op2 = outPt2Index;
        let op1b: number = this.outRec.getUniquePt(op1, true);
        let op2b: number = this.outRec.getUniquePt(op2, true);
        //nb: For non-horizontal joins ...
        //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
        //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
        //make sure the polygons are correctly oriented ...

        const reverse1: boolean = this.tEdge.checkReverse(this.outRec.point(op1), this.outRec.point(op1b), offPoint);

        if (reverse1) {
            op1b = this.outRec.getUniquePt(op1, false);

            if (this.tEdge.checkReverse(this.outRec.point(op1), this.outRec.point(op1b), offPoint)) {
                return result;
            }
        }

        const reverse2: boolean = this.tEdge.checkReverse(this.outRec.point(op2), this.outRec.point(op2b), offPoint);

        if (reverse2) {
            op2b = this.outRec.getUniquePt(op2, false);

            if (this.tEdge.checkReverse(this.outRec.point(op2), this.outRec.point(op2b), offPoint)) {
                return result;
            }
        }

        if (op1b === op1 || op2b === op2 || op1b === op2b || (isRecordsSame && reverse1 === reverse2)) {
            return result;
        }

        result.outHash2 = join_u16_to_u32(index2, this.outRec.applyJoin(outPt1Index, outPt2Index, reverse1));

        result.result = true;

        return result;
    }

    private horzSegmentsOverlap(outHash: number, offPoint: Point<Int32Array>, edgeIndex: number): boolean {
        const outPtIndex = get_u16_from_u32(outHash, 1);
        const top = this.tEdge.top(edgeIndex);
        const bot = this.tEdge.bot(edgeIndex);

        return PointI32.horzSegmentsOverlap(this.outRec.point(outPtIndex), offPoint, bot, top);
    }
}
