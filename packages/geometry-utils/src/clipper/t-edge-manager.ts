import { PointI32 } from '../geometry';
import { UNASSIGNED } from './constants';
import { showError } from './helpers';
import IntersectNode from './intersect-node';
import LocalMinima from './local-minima';
import OutRecManager from './out-rec-manager';
import Scanbeam from './scanbeam';
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from './types';
import { Point } from 'src/types';
import TEdgeController from './t-edge-controller';

export default class TEdgeManager {
    private localMinima: LocalMinima;
    private intersections: IntersectNode;
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: Scanbeam;
    private outRecManager: OutRecManager;
    private tEdgeController: TEdgeController;

    constructor(scanbeam: Scanbeam, outRecManager: OutRecManager, tedgeController: TEdgeController) {
        this.intersections = new IntersectNode();
        this.localMinima = new LocalMinima();
        this.scanbeam = scanbeam;
        this.outRecManager = outRecManager;
        this.tEdgeController = tedgeController;
    }

    public addPath(polygon: PointI32[], polyType: POLY_TYPE): boolean {
        let edgeIndex = this.tEdgeController.createPath(polygon, polyType);

        if (edgeIndex === UNASSIGNED) {
            return false;
        }

        let minIndex: number = UNASSIGNED;

        while (true) {
            edgeIndex = this.tEdgeController.findNextLocMin(edgeIndex);

            if (edgeIndex === minIndex) {
                break;
            }

            if (minIndex === UNASSIGNED) {
                minIndex = edgeIndex;
            }

            const [y, leftBound, rightBound] = this.tEdgeController.createLocalMinima(edgeIndex);
            const localMinima = this.localMinima.insert(y, leftBound, rightBound);

            edgeIndex = this.tEdgeController.processBounds(
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
        const result = this.tEdgeController.updateEdgeIntoAEL(edgeIndex);
        const edge = this.tEdgeController.at(result);

        if (!edge.isHorizontal) {
            this.scanbeam.insert(edge.top.y);
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

            if (leftBound !== UNASSIGNED) {
                this.tEdgeController.at(leftBound).reset(DIRECTION.LEFT);
            }
            if (rightBound !== UNASSIGNED) {
                this.tEdgeController.at(rightBound).reset(DIRECTION.RIGHT);
            }

            this.scanbeam.insert(y);
        }

        this.tEdgeController.reset();
    }

    public buildIntersectList(botY: number, topY: number): void {
        if (!this.tEdgeController.prepareForIntersections(topY)) {
            return;
        }

        //bubblesort ...
        let isModified: boolean = true;
        const point: PointI32 = PointI32.create();

        while (isModified && this.tEdgeController.sorted !== UNASSIGNED) {
            isModified = false;
            let currIndex = this.tEdgeController.sorted;

            while (this.tEdgeController.nextSorted(currIndex) !== UNASSIGNED) {
                const nextIndex = this.tEdgeController.nextSorted(currIndex);

                point.set(0, 0);
                const currEdge = this.tEdgeController.at(currIndex);
                const nextEdge = this.tEdgeController.at(nextIndex);
                //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
                if (currEdge.curr.x > nextEdge.curr.x) {
                    if (
                        !this.tEdgeController.intersectPoint(currIndex, nextIndex, point) &&
                        currEdge.curr.x > nextEdge.curr.x + 1
                    ) {
                        //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
                        //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
                        showError('Intersection error');
                    }

                    if (point.y > botY) {
                        point.set(
                            Math.abs(currEdge.dx) > Math.abs(nextEdge.dx) ? nextEdge.topX(botY) : currEdge.topX(botY),
                            botY
                        );
                    }

                    this.intersections.add(currIndex, nextIndex, point);
                    this.tEdgeController.swapPositionsInList(currIndex, nextIndex, false);
                    isModified = true;
                } else {
                    currIndex = nextIndex;
                }
            }

            const prevIndex = this.tEdgeController.prevSorted(currIndex);

            if (prevIndex === UNASSIGNED) {
                break;
            }

            this.tEdgeController.setNeighboar(prevIndex, true, false, UNASSIGNED);
        }

        this.tEdgeController.sorted = UNASSIGNED;
    }

    public intersectEdges(edge1Index: number, edge2Index: number, point: Point<Int32Array>, isProtect: boolean): void {
        //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
        //e2 in AEL except when e1 is being inserted at the intersection point ...
        const edge1 = this.tEdgeController.at(edge1Index);
        const edge2 = this.tEdgeController.at(edge2Index);
        const edge1Stops: boolean = this.tEdgeController.getStop(edge1Index, point, isProtect);
        const edge2Stops: boolean = this.tEdgeController.getStop(edge2Index, point, isProtect);
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
        this.tEdgeController.alignWndCount(edge1Index, edge2Index);

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
                this.outRecManager.addLocalMaxPoly(edge1Index, edge2Index, point);
            } else {
                this.outRecManager.addOutPt(edge1Index, point);
                this.outRecManager.addOutPt(edge2Index, point);
                this.tEdgeController.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge1Contributing) {
            if (e2Wc === 0 || e2Wc === 1) {
                this.outRecManager.addOutPt(edge1Index, point);
                this.tEdgeController.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if (edge2Contributing) {
            if (e1Wc === 0 || e1Wc === 1) {
                this.outRecManager.addOutPt(edge2Index, point);
                this.tEdgeController.swapSidesAndIndeces(edge1Index, edge2Index);
            }
        } else if ((e1Wc === 0 || e1Wc === 1) && (e2Wc === 0 || e2Wc === 1) && !edge1Stops && !edge2Stops) {
            //neither edge is currently contributing ...
            if (this.tEdgeController.swapEdges(this.clipType, this.fillType, e1Wc, e2Wc, edge1Index, edge2Index)) {
                this.outRecManager.addLocalMinPoly(edge1Index, edge2Index, point);
            }
        }
        if (edge1Stops !== edge2Stops && ((edge1Stops && edge1.isAssigned) || (edge2Stops && edge2.isAssigned))) {
            this.tEdgeController.swapSidesAndIndeces(edge1Index, edge2Index);
        }
        //finally, delete any non-contributing maxima edges  ...
        if (edge1Stops) {
            this.tEdgeController.deleteFromList(edge1Index, true);
        }

        if (edge2Stops) {
            this.tEdgeController.deleteFromList(edge2Index, true);
        }
    }

    public edgesAdjacent(nodeIndex: number): boolean {
        const edge1Index = this.intersections.getEdge1Index(nodeIndex);
        const edge2Index = this.intersections.getEdge2Index(nodeIndex);

        return (
            this.tEdgeController.getNeighboar(edge1Index, true, false) === edge2Index ||
            this.tEdgeController.getNeighboar(edge1Index, false, false) === edge2Index
        );
    }

    public fixupIntersectionOrder(): boolean {
        //pre-condition: intersections are sorted bottom-most first.
        //Now it's crucial that intersections are made only between adjacent edges,
        //so to ensure this the order of intersections may need adjusting ...
        this.intersections.sort();

        this.tEdgeController.copyAELToSEL();

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

            this.tEdgeController.swapPositionsInList(
                this.intersections.getEdge1Index(i),
                this.intersections.getEdge2Index(i),
                false
            );
        }

        return true;
    }

    public intersectOpenEdges(edge1Index: number, edge2Index: number, isProtect: boolean, point: Point<Int32Array>) {
        const edge1 = this.tEdgeController.at(edge1Index);
        const edge2 = this.tEdgeController.at(edge2Index);
        const edge1Stops: boolean =
            !isProtect && !this.tEdgeController.hasNextLocalMinima(edge1Index) && edge1.top.almostEqual(point);
        const edge2Stops: boolean =
            !isProtect && !this.tEdgeController.hasNextLocalMinima(edge2Index) && edge2.top.almostEqual(point);
        const edge1Contributing: boolean = edge1.isAssigned;
        const edge2Contributing: boolean = edge2.isAssigned;
        //ignore subject-subject open path intersections UNLESS they
        //are both open paths, AND they are both 'contributing maximas' ...
        if (edge1.isWindDeletaEmpty && edge2.isWindDeletaEmpty) {
            if ((edge1Stops || edge2Stops) && edge1Contributing && edge2Contributing) {
                this.outRecManager.addLocalMaxPoly(edge1Index, edge2Index, point);
            }
        }
        //if intersecting a subj line with a subj poly ...
        else if (edge1.polyTyp === edge2.polyTyp && edge1.windDelta !== edge2.windDelta && this.clipType === CLIP_TYPE.UNION) {
            if (edge1.isWindDeletaEmpty) {
                if (edge2Contributing) {
                    this.outRecManager.addOutPt(edge1Index, point);

                    if (edge1Contributing) {
                        edge1.unassign();
                    }
                }
            } else {
                if (edge1Contributing) {
                    this.outRecManager.addOutPt(edge2Index, point);

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
                this.outRecManager.addOutPt(edge1Index, point);

                if (edge1Contributing) {
                    edge1.unassign();
                }
            } else if (
                edge2.isWindDeletaEmpty &&
                Math.abs(edge1.windCount1) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || edge1.windCount2 === 0)
            ) {
                this.outRecManager.addOutPt(edge2Index, point);

                if (edge2Contributing) {
                    edge2.unassign();
                }
            }
        }

        if (edge1Stops) {
            if (!edge1.isAssigned) {
                this.tEdgeController.deleteFromList(edge1Index, true);
            } else {
                showError('Error intersecting polylines');
            }
        }

        if (edge2Stops) {
            if (!edge2.isAssigned) {
                this.tEdgeController.deleteFromList(edge2Index, true);
            } else {
                showError('Error intersecting polylines');
            }
        }
    }

    public processHorizontal(horzEdgeIndex: number, isTopOfScanbeam: boolean) {
        let horzEdge = this.tEdgeController.at(horzEdgeIndex);
        let dirValue: Float64Array = this.tEdgeController.horzDirection(horzEdgeIndex);
        let dir: DIRECTION = dirValue[0] as DIRECTION;
        let horzLeft: number = dirValue[1];
        let horzRight: number = dirValue[2];
        const lastHorzIndex = this.tEdgeController.getLastHorizontal(horzEdgeIndex);
        const maxPairIndex = this.tEdgeController.getMaxPair(lastHorzIndex);
        let horzIndex = horzEdgeIndex;

        while (true) {
            const isLastHorz: boolean = horzIndex === lastHorzIndex;
            let currIndex = this.tEdgeController.getNeighboar(horzIndex, dir === DIRECTION.RIGHT, true);
            let nextIndex = UNASSIGNED;

            while (currIndex !== UNASSIGNED) {
                const edge = this.tEdgeController.at(currIndex);
                //Break if we've got to the end of an intermediate horizontal edge ...
                //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
                if (
                    edge.curr.x === horzEdge.top.x &&
                    this.tEdgeController.hasNextLocalMinima(horzIndex) &&
                    edge.dx < this.tEdgeController.at(this.tEdgeController.getNextLocalMinima(horzIndex)).dx
                ) {
                    break;
                }

                nextIndex = this.tEdgeController.getNeighboar(currIndex, dir === DIRECTION.RIGHT, true);
                //saves eNext for later
                if (
                    (dir === DIRECTION.RIGHT && edge.curr.x <= horzRight) ||
                    (dir === DIRECTION.LEFT && edge.curr.x >= horzLeft)
                ) {
                    if (horzEdge.isFilled && isTopOfScanbeam) {
                        this.outRecManager.prepareHorzJoins(horzIndex);
                    }

                    //so far we're still in range of the horizontal Edge  but make sure
                    //we're at the last of consec. horizontals when matching with eMaxPair
                    if (currIndex === maxPairIndex && isLastHorz) {
                        const index1 = dir === DIRECTION.RIGHT ? horzIndex : currIndex;
                        const index2 = dir === DIRECTION.RIGHT ? currIndex : horzIndex;

                        this.intersectEdges(index1, index2, edge.top, false);

                        const eMaxPair = this.tEdgeController.at(maxPairIndex);

                        if (eMaxPair.isAssigned) {
                            showError('ProcessHorizontal error');
                        }

                        return;
                    }

                    const point = PointI32.from(edge.curr);
                    const index1 = dir === DIRECTION.RIGHT ? horzIndex : currIndex;
                    const index2 = dir === DIRECTION.RIGHT ? currIndex : horzIndex;

                    this.intersectEdges(index1, index2, point, true);

                    this.tEdgeController.swapPositionsInList(horzIndex, currIndex, true);
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
                this.outRecManager.prepareHorzJoins(horzIndex);
            }

            if (
                this.tEdgeController.hasNextLocalMinima(horzIndex) &&
                this.tEdgeController.at(this.tEdgeController.getNextLocalMinima(horzIndex)).isHorizontal
            ) {
                horzIndex = this.updateEdgeIntoAEL(horzIndex);
                horzEdge = this.tEdgeController.at(horzIndex);

                if (horzEdge.isAssigned) {
                    this.outRecManager.addOutPt(horzIndex, horzEdge.bot);
                }

                dirValue = this.tEdgeController.horzDirection(horzIndex);
                dir = dirValue[0] as DIRECTION;
                horzLeft = dirValue[1];
                horzRight = dirValue[2];
            } else {
                break;
            }
        }

        //end for (;;)
        if (this.tEdgeController.hasNextLocalMinima(horzIndex)) {
            if (horzEdge.isAssigned) {
                const op1 = this.outRecManager.addOutPt(horzIndex, horzEdge.top);
                horzIndex = this.updateEdgeIntoAEL(horzIndex);
                horzEdge = this.tEdgeController.at(horzIndex);

                if (horzEdge.isWindDeletaEmpty) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                const condition1 = this.tEdgeController.checkHorizontalCondition(horzIndex, false);

                this.outRecManager.insertJoin(condition1, op1, this.tEdgeController.prevActive(horzIndex), horzEdge.bot);

                if (!condition1) {
                    const condition2 = this.tEdgeController.checkHorizontalCondition(horzIndex, true);

                    this.outRecManager.insertJoin(condition2, op1, this.tEdgeController.nextActive(horzIndex), horzEdge.bot);
                }

                return;
            }

            this.updateEdgeIntoAEL(horzIndex);

            return;
        }

        if (maxPairIndex !== UNASSIGNED) {
            const eMaxPair = this.tEdgeController.at(maxPairIndex);

            if (eMaxPair.isAssigned) {
                const index1 = dir === DIRECTION.RIGHT ? horzIndex : maxPairIndex;
                const index2 = dir === DIRECTION.RIGHT ? maxPairIndex : horzIndex;

                this.intersectEdges(index1, index2, horzEdge.top, false);

                if (eMaxPair.isAssigned) {
                    showError('ProcessHorizontal error');
                }

                return;
            }

            this.tEdgeController.deleteFromList(horzIndex, true);
            this.tEdgeController.deleteFromList(maxPairIndex, true);

            return;
        }

        if (horzEdge.isAssigned) {
            this.outRecManager.addOutPt(horzIndex, horzEdge.top);
        }

        this.tEdgeController.deleteFromList(horzIndex, true);
    }

    public processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdgeIndex = this.tEdgeController.sorted;

        while (horzEdgeIndex !== UNASSIGNED) {
            this.tEdgeController.deleteFromList(horzEdgeIndex, false);

            this.processHorizontal(horzEdgeIndex, isTopOfScanbeam);

            horzEdgeIndex = this.tEdgeController.sorted;
        }
    }

    public processEdgesAtTopOfScanbeam(topY: number, strictlySimple: boolean): void {
        let isMaximaEdge: boolean = false;
        let outPt1: number = UNASSIGNED;
        let edgeIndex: number = this.tEdgeController.active;

        while (edgeIndex !== UNASSIGNED) {
            //1. process maxima, treating them as if they're 'bent' horizontal edges,
            //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
            isMaximaEdge = this.tEdgeController.getMaxima(edgeIndex, topY);

            if (isMaximaEdge) {
                const tempEdge = this.tEdgeController.at(this.tEdgeController.maximaPair(edgeIndex));
                isMaximaEdge = this.tEdgeController.maximaPair(edgeIndex) === UNASSIGNED || !tempEdge.isHorizontal;
            }

            if (isMaximaEdge) {
                const prevIndex = this.tEdgeController.prevActive(edgeIndex);
                this.doMaxima(edgeIndex);

                edgeIndex =
                    this.tEdgeController.prevActive(edgeIndex) === UNASSIGNED
                        ? this.tEdgeController.active
                        : this.tEdgeController.nextActive(prevIndex);
                continue;
            }

            //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
            if (
                this.tEdgeController.getIntermediate(edgeIndex, topY) &&
                this.tEdgeController.at(this.tEdgeController.getNextLocalMinima(edgeIndex)).isHorizontal
            ) {
                edgeIndex = this.updateEdgeIntoAEL(edgeIndex);
                const edge = this.tEdgeController.at(edgeIndex);

                if (edge.isAssigned) {
                    this.outRecManager.addOutPt(edgeIndex, edge.bot);
                }

                this.tEdgeController.addEdgeToSEL(edgeIndex);
            } else {
                const edge = this.tEdgeController.at(edgeIndex);
                edge.curr.set(edge.topX(topY), topY);
            }

            const edge = this.tEdgeController.at(edgeIndex);

            if (strictlySimple && this.tEdgeController.canAddScanbeam(edgeIndex)) {
                this.outRecManager.addScanbeamJoin(edgeIndex, this.tEdgeController.prevActive(edgeIndex), edge.curr);
                //StrictlySimple (type-3) join
            }

            edgeIndex = this.tEdgeController.nextActive(edgeIndex);
        }
        //3. Process horizontals at the Top of the scanbeam ...
        this.processHorizontals(true);
        //4. Promote intermediate vertices ...
        edgeIndex = this.tEdgeController.active;

        while (edgeIndex !== UNASSIGNED) {
            if (this.tEdgeController.getIntermediate(edgeIndex, topY)) {
                const edge1 = this.tEdgeController.at(edgeIndex);
                outPt1 = edge1.isAssigned ? this.outRecManager.addOutPt(edgeIndex, edge1.top) : UNASSIGNED;
                edgeIndex = this.updateEdgeIntoAEL(edgeIndex);
                const edge2 = this.tEdgeController.at(edgeIndex);
                //if output polygons share an edge, they'll need joining later...
                const condition1 = this.tEdgeController.checkSharedCondition(edgeIndex, outPt1, false);

                if (
                    !this.outRecManager.insertJoin(
                        condition1,
                        outPt1,
                        this.tEdgeController.prevActive(edgeIndex),
                        edge2.bot,
                        edge2.top
                    )
                ) {
                    const condition2 = this.tEdgeController.checkSharedCondition(edgeIndex, outPt1, true);
                    this.outRecManager.insertJoin(
                        condition2,
                        outPt1,
                        this.tEdgeController.nextActive(edgeIndex),
                        edge2.bot,
                        edge2.top
                    );
                }
            }

            edgeIndex = this.tEdgeController.nextActive(edgeIndex);
        }
    }

    private doMaxima(edgeIndex: number): void {
        const edge = this.tEdgeController.at(edgeIndex);

        if (this.tEdgeController.maximaPair(edgeIndex) === UNASSIGNED) {
            if (edge.isAssigned) {
                this.outRecManager.addOutPt(edgeIndex, edge.top);
            }

            this.tEdgeController.deleteFromList(edgeIndex, true);

            return;
        }

        let nextEdgeIndex: number = this.tEdgeController.nextActive(edgeIndex);

        while (nextEdgeIndex !== UNASSIGNED && nextEdgeIndex !== this.tEdgeController.maximaPair(edgeIndex)) {
            this.intersectEdges(edgeIndex, nextEdgeIndex, edge.top, true);
            this.tEdgeController.swapPositionsInList(edgeIndex, nextEdgeIndex, true);
            nextEdgeIndex = this.tEdgeController.nextActive(edgeIndex);
        }

        const maxIndex = this.tEdgeController.maximaPair(edgeIndex);
        const maxPairEdge = this.tEdgeController.at(maxIndex);

        if (!edge.isAssigned && !maxPairEdge.isAssigned) {
            this.tEdgeController.deleteFromList(edgeIndex, true);
            this.tEdgeController.deleteFromList(maxIndex, true);
        } else if (edge.isAssigned && maxPairEdge.isAssigned) {
            this.intersectEdges(edgeIndex, maxIndex, edge.top, false);
        } else if (edge.isWindDeletaEmpty) {
            if (edge.isAssigned) {
                this.outRecManager.addOutPt(edgeIndex, edge.top);
                edge.unassign();
            }

            this.tEdgeController.deleteFromList(edgeIndex, true);

            if (maxPairEdge.isAssigned) {
                this.outRecManager.addOutPt(maxIndex, edge.top);
                maxPairEdge.unassign();
            }

            this.tEdgeController.deleteFromList(maxIndex, true);
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
            this.tEdgeController.swapPositionsInList(edge1Index, edge2Index, true);
        }

        this.intersections.clean();
    }

    public processIntersections(botY: number, topY: number): boolean {
        if (this.tEdgeController.active === UNASSIGNED) {
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
            this.tEdgeController.sorted = UNASSIGNED;
            this.intersections.clean();

            showError('ProcessIntersections error');
        }

        this.tEdgeController.sorted = UNASSIGNED;

        return true;
    }

    public insertLocalMinimaIntoAEL(botY: number): void {
        let outPt: number = UNASSIGNED;

        while (!Number.isNaN(this.localMinima.minY) && this.localMinima.minY === botY) {
            let [leftBoundIndex, rightBoundIndex] = this.localMinima.pop();
            const leftBound = this.tEdgeController.at(leftBoundIndex);
            const rightBound = this.tEdgeController.at(rightBoundIndex);
            outPt = UNASSIGNED;

            if (leftBoundIndex === UNASSIGNED) {
                this.tEdgeController.insertEdgeIntoAEL(rightBoundIndex);
                this.tEdgeController.setWindingCount(rightBoundIndex, this.clipType);

                if (this.tEdgeController.getContributing(rightBoundIndex, this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(rightBoundIndex, rightBound.bot);
                }
            } else if (rightBoundIndex === UNASSIGNED) {
                this.tEdgeController.insertEdgeIntoAEL(leftBoundIndex);
                this.tEdgeController.setWindingCount(leftBoundIndex, this.clipType);

                if (this.tEdgeController.getContributing(leftBoundIndex, this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(leftBoundIndex, leftBound.bot);
                }

                this.scanbeam.insert(leftBound.top.y);
            } else {
                this.tEdgeController.insertEdgeIntoAEL(leftBoundIndex);
                this.tEdgeController.insertEdgeIntoAEL(rightBoundIndex, leftBoundIndex);
                this.tEdgeController.setWindingCount(leftBoundIndex, this.clipType);
                rightBound.windCount1 = leftBound.windCount1;
                rightBound.windCount2 = leftBound.windCount2;

                if (this.tEdgeController.getContributing(leftBoundIndex, this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addLocalMinPoly(leftBoundIndex, rightBoundIndex, leftBound.bot);
                }

                this.scanbeam.insert(leftBound.top.y);
            }

            if (rightBoundIndex !== UNASSIGNED) {
                if (rightBound.isHorizontal) {
                    this.tEdgeController.addEdgeToSEL(rightBoundIndex);
                } else {
                    this.scanbeam.insert(rightBound.top.y);
                }
            }

            if (leftBoundIndex === UNASSIGNED || rightBoundIndex === UNASSIGNED) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            if (outPt !== UNASSIGNED && rightBound.isHorizontal && !rightBound.isWindDeletaEmpty) {
                this.outRecManager.addOutputJoins(outPt, rightBoundIndex);
            }

            const condition = this.tEdgeController.canJoinLeft(leftBoundIndex);

            this.outRecManager.insertJoin(
                condition,
                outPt,
                this.tEdgeController.prevActive(leftBoundIndex),
                leftBound.bot,
                leftBound.top
            );

            if (this.tEdgeController.nextActive(leftBoundIndex) !== rightBoundIndex) {
                const condition = this.tEdgeController.canJoinRight(rightBoundIndex);

                this.outRecManager.insertJoin(
                    condition,
                    outPt,
                    this.tEdgeController.prevActive(rightBoundIndex),
                    rightBound.bot,
                    rightBound.top
                );

                if (this.tEdgeController.nextActive(leftBoundIndex) !== UNASSIGNED) {
                    let edgeIndex = this.tEdgeController.nextActive(leftBoundIndex);

                    while (edgeIndex !== rightBoundIndex) {
                        //nb: For calculating winding counts etc, IntersectEdges() assumes
                        //that param1 will be to the right of param2 ABOVE the intersection ...
                        this.intersectEdges(rightBoundIndex, edgeIndex, leftBound.curr, false);
                        //order important here
                        edgeIndex = this.tEdgeController.getNeighboar(edgeIndex, true, true);
                    }
                }
            }
        }
    }
}
