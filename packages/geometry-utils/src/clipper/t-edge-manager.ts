import { PointI32 } from '../geometry';
import { UNASSIGNED } from './constants';
import { showError } from './helpers';
import IntersectNode from './intersect-node';
import LocalMinima from './local-minima';
import OutRecManager from './out-rec-manager';
import Scanbeam from './scanbeam';
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from './types';
import { Point } from 'src/types';
import TEdge from './t-edge';

export default class TEdgeManager {
    private localMinima: LocalMinima;
    private intersections: IntersectNode;
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: Scanbeam;
    private outRecManager: OutRecManager;
    private tEdge: TEdge;

    constructor(scanbeam: Scanbeam, outRecManager: OutRecManager, tedgeController: TEdge) {
        this.intersections = new IntersectNode();
        this.localMinima = new LocalMinima();
        this.scanbeam = scanbeam;
        this.outRecManager = outRecManager;
        this.tEdge = tedgeController;
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

    public get isMinimaEmpty(): boolean {
        return this.localMinima.isEmpty;
    }

    public init(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE): void {
        this.clipType = clipType;
        this.fillType = fillType;
    }

    public updateEdgeIntoAEL(edgeIndex: number): number {
        const result = this.tEdge.updateEdgeIntoAEL(edgeIndex);


        if (!this.tEdge.isHorizontal(result)) {
            this.scanbeam.insert(this.tEdge.top(result).y);
        }

        return result;
    }

    public reset(): void {
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
                    if (
                        !this.tEdge.intersectPoint(currIndex, nextIndex, point) &&
                        this.tEdge.curr(currIndex).x > this.tEdge.curr(nextIndex).x + 1
                    ) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.set(
                            Math.abs(this.tEdge.dx(currIndex)) > Math.abs(this.tEdge.dx(nextIndex)) ? this.tEdge.topX(nextIndex, botY) : this.tEdge.topX(currIndex, botY),
                            botY
                        );
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

        const e1Wc: number = this.tEdge.getWndTypeFilled(edge1Index, this.fillType);
        const e2Wc: number = this.tEdge.getWndTypeFilled(edge2Index, this.fillType);

        if (edge1Contributing && edge2Contributing) {
            if (
                edge1Stops ||
                edge2Stops ||
                (e1Wc !== 0 && e1Wc !== 1) ||
                (e2Wc !== 0 && e2Wc !== 1) ||
                !this.tEdge.isSamePolyType(edge1Index, edge2Index)
            ) {
                this.outRecManager.addLocalMaxPoly(edge1Index, edge2Index, point);
            } else {
                this.outRecManager.addOutPt(edge1Index, point);
                this.outRecManager.addOutPt(edge2Index, point);
                this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                this.outRecManager.addOutPt(edge1Index, point);
                this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                this.outRecManager.addOutPt(edge2Index, point);
                this.tEdge.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            if (this.tEdge.swapEdges(this.clipType, this.fillType, e1Wc, e2Wc, edge1Index, edge2Index)) {
                this.outRecManager.addLocalMinPoly(edge1Index, edge2Index, point);
            }
        }
        if (edge1Stops !== edge2Stops && ((edge1Stops && this.tEdge.isAssigned(edge1Index)) || (edge2Stops && this.tEdge.isAssigned(edge2Index)))) {
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

            this.tEdge.swapPositionsInList(
                this.intersections.getEdge1Index(i),
                this.intersections.getEdge2Index(i),
                false
            );
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
                this.outRecManager.addLocalMaxPoly(edge1Index, edge2Index, point);
            }
        }
        //if intersecting a subj line with a subj poly ...
        else if (this.tEdge.isSamePolyType(edge1Index, edge2Index) && this.tEdge.windDelta(edge1Index) !== this.tEdge.windDelta(edge2Index) && this.clipType === CLIP_TYPE.UNION) {
            if (this.tEdge.isWindDeletaEmpty(edge1Index)) {
                if (edge2Contributing) {
                    this.outRecManager.addOutPt(edge1Index, point);

                    if (edge1Contributing) {
                        this.tEdge.unassign(edge1Index);
                    }
                }
            } else {
                if (edge1Contributing) {
                    this.outRecManager.addOutPt(edge2Index, point);

                    if (edge2Contributing) {
                        this.tEdge.unassign(edge2Index);
                    }
                }
            }
        } else if (!this.tEdge.isSamePolyType(edge1Index, edge2Index)) {
            if (
                this.tEdge.isWindDeletaEmpty(edge1Index) &&
                Math.abs(this.tEdge.windCount1(edge2Index)) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || this.tEdge.windCount2(edge2Index) === 0)
            ) {
                this.outRecManager.addOutPt(edge1Index, point);

                if (edge1Contributing) {
                    this.tEdge.unassign(edge1Index);
                }
            } else if (
                this.tEdge.isWindDeletaEmpty(edge2Index) &&
                Math.abs(this.tEdge.windCount1(edge1Index)) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || this.tEdge.windCount2(edge1Index) === 0)
            ) {
                this.outRecManager.addOutPt(edge2Index, point);

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
                        this.outRecManager.prepareHorzJoins(horzIndex);
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
                this.outRecManager.prepareHorzJoins(horzIndex);
            }

            if (
                this.tEdge.hasNextLocalMinima(horzIndex) &&
                this.tEdge.isHorizontal(this.tEdge.getNextLocalMinima(horzIndex))
            ) {
                horzIndex = this.updateEdgeIntoAEL(horzIndex);

                if (this.tEdge.isAssigned(horzIndex)) {
                    this.outRecManager.addOutPt(horzIndex, this.tEdge.bot(horzIndex));
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
                const op1 = this.outRecManager.addOutPt(horzIndex, this.tEdge.top(horzIndex));
                horzIndex = this.updateEdgeIntoAEL(horzIndex);

                if (this.tEdge.isWindDeletaEmpty(horzIndex)) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                const condition1 = this.tEdge.checkHorizontalCondition(horzIndex, false);

                this.outRecManager.insertJoin(condition1, op1, this.tEdge.prevActive(horzIndex), this.tEdge.bot(horzIndex));

                if (!condition1) {
                    const condition2 = this.tEdge.checkHorizontalCondition(horzIndex, true);

                    this.outRecManager.insertJoin(condition2, op1, this.tEdge.nextActive(horzIndex), this.tEdge.bot(horzIndex));
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
            this.outRecManager.addOutPt(horzIndex, this.tEdge.top(horzIndex));
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

    public processEdgesAtTopOfScanbeam(topY: number, strictlySimple: boolean): void {
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
                    this.tEdge.prevActive(edgeIndex) === UNASSIGNED
                        ? this.tEdge.active
                        : this.tEdge.nextActive(prevIndex);
                continue;
            }

            //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
            if (
                this.tEdge.getIntermediate(edgeIndex, topY) &&
                this.tEdge.isHorizontal(this.tEdge.getNextLocalMinima(edgeIndex))
            ) {
                edgeIndex = this.updateEdgeIntoAEL(edgeIndex);

                if (this.tEdge.isAssigned(edgeIndex)) {
                    this.outRecManager.addOutPt(edgeIndex, this.tEdge.bot(edgeIndex));
                }

                this.tEdge.addEdgeToSEL(edgeIndex);
            } else {
                this.tEdge.curr(edgeIndex).set(this.tEdge.topX(edgeIndex, topY), topY);
            }


            if (strictlySimple && this.tEdge.canAddScanbeam(edgeIndex)) {
                this.outRecManager.addScanbeamJoin(edgeIndex, this.tEdge.prevActive(edgeIndex), this.tEdge.curr(edgeIndex));
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
                outPt1 = this.tEdge.isAssigned(edgeIndex) ? this.outRecManager.addOutPt(edgeIndex, this.tEdge.top(edgeIndex)) : UNASSIGNED;
                edgeIndex = this.updateEdgeIntoAEL(edgeIndex);
                //if output polygons share an edge, they'll need joining later...
                const condition1 = this.tEdge.checkSharedCondition(edgeIndex, outPt1, false);

                if (
                    !this.outRecManager.insertJoin(
                        condition1,
                        outPt1,
                        this.tEdge.prevActive(edgeIndex),
                        this.tEdge.bot(edgeIndex),
                        this.tEdge.top(edgeIndex)
                    )
                ) {
                    const condition2 = this.tEdge.checkSharedCondition(edgeIndex, outPt1, true);
                    this.outRecManager.insertJoin(
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
                this.outRecManager.addOutPt(edgeIndex, this.tEdge.top(edgeIndex));
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
                this.outRecManager.addOutPt(edgeIndex, this.tEdge.top(edgeIndex));
                this.tEdge.unassign(edgeIndex);
            }

            this.tEdge.deleteFromList(edgeIndex, true);

            if (this.tEdge.isAssigned(maxIndex)) {
                this.outRecManager.addOutPt(maxIndex, this.tEdge.top(edgeIndex));
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
                this.tEdge.setWindingCount(rightBoundIndex, this.clipType);

                if (this.tEdge.getContributing(rightBoundIndex, this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(rightBoundIndex, this.tEdge.bot(rightBoundIndex));
                }
            } else if (rightBoundIndex === UNASSIGNED) {
                this.tEdge.insertEdgeIntoAEL(leftBoundIndex);
                this.tEdge.setWindingCount(leftBoundIndex, this.clipType);

                if (this.tEdge.getContributing(leftBoundIndex, this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(leftBoundIndex, this.tEdge.bot(leftBoundIndex));
                }

                this.scanbeam.insert(this.tEdge.top(leftBoundIndex).y);
            } else {
                this.tEdge.insertEdgeIntoAEL(leftBoundIndex);
                this.tEdge.insertEdgeIntoAEL(rightBoundIndex, leftBoundIndex);
                this.tEdge.setWindingCount(leftBoundIndex, this.clipType);
                this.tEdge.setWindCount1(rightBoundIndex, this.tEdge.windCount1(leftBoundIndex));
                this.tEdge.setWindCount2(rightBoundIndex, this.tEdge.windCount2(leftBoundIndex));

                if (this.tEdge.getContributing(leftBoundIndex, this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addLocalMinPoly(leftBoundIndex, rightBoundIndex, this.tEdge.bot(leftBoundIndex));
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
            if (outPt !== UNASSIGNED && this.tEdge.isHorizontal(rightBoundIndex) && !this.tEdge.isWindDeletaEmpty(rightBoundIndex)) {
                this.outRecManager.addOutputJoins(outPt, rightBoundIndex);
            }

            const condition = this.tEdge.canJoinLeft(leftBoundIndex);

            this.outRecManager.insertJoin(
                condition,
                outPt,
                this.tEdge.prevActive(leftBoundIndex),
                this.tEdge.bot(leftBoundIndex),
                this.tEdge.top(leftBoundIndex)
            );

            if (this.tEdge.nextActive(leftBoundIndex) !== rightBoundIndex) {
                const condition = this.tEdge.canJoinRight(rightBoundIndex);

                this.outRecManager.insertJoin(
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
}
