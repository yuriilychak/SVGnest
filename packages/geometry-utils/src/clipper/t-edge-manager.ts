import { PointI32 } from "../geometry";
import { showError } from "./helpers";
import IntersectNode from "./intersect-node";
import JoinManager from "./join-manager";
import LocalMinimaManager from "./local-minima-manager";
import OutPt from "./out-pt";
import OutRecManager from "./out-rec-manager";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";
import { CLIP_TYPE, DIRECTION, NullPtr, POLY_FILL_TYPE } from "./types";

export default class TEdgeManager {
    private activeEdges: TEdge = null;
    private sortedEdges: TEdge = null;
    private intersections: IntersectNode[] = [];
    private clipType: CLIP_TYPE = CLIP_TYPE.UNION;
    private fillType: POLY_FILL_TYPE = POLY_FILL_TYPE.NON_ZERO;
    private scanbeam: Scanbeam;
    private joinManager: JoinManager;
    private outRecManager: OutRecManager;
    private isUseFullRange: boolean = false;

    constructor(scanbeam: Scanbeam, joinManager: JoinManager, outRecManager: OutRecManager) {
        this.scanbeam = scanbeam;
        this.joinManager = joinManager;
        this.outRecManager = outRecManager;
    }

    public init(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE, isUseFullRange: boolean): void {
        this.clipType = clipType;
        this.fillType = fillType;
        this.isUseFullRange = isUseFullRange;
    }

    public updateEdgeIntoAEL(edge: TEdge): NullPtr<TEdge> {
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
            this.scanbeam.insert(edge.Top.y);
        }

        return edge;
    }

    public swapPositionsInAEL(edge1: TEdge, edge2: TEdge): void {
        const edge = TEdge.swapPositionsInEL(edge1, edge2, true);

        if (edge !== null) {
            this.activeEdges = edge;
        }
    }
    
    public swapPositionsInSEL(edge1: TEdge, edge2: TEdge) {
        const edge = TEdge.swapPositionsInEL(edge1, edge2, false);

        if (edge !== null) {
            this.sortedEdges = edge;
        }
    }

    public copyAELToSEL(): void {
        let edge: TEdge = this.activeEdges;
        this.sortedEdges = edge;

        while (edge !== null) {
            edge = edge.copyAELToSEL();
        }
    }

    public reset(): void {
        this.activeEdges = null;
        this.sortedEdges = null;
    }

    public buildIntersectList(botY: number, topY: number): void {
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
        let point: PointI32 = null;

        while (isModified && this.sortedEdges !== null) {
            isModified = false;
            edge = this.sortedEdges;

            while (edge.NextInSEL !== null) {
                nextEdge = edge.NextInSEL;
                point = PointI32.create();
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
                    this.swapPositionsInSEL(edge, nextEdge);
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
        edge1.alignWndCount(edge2);

        const e1Wc: number = edge1.getWndTypeFilled(this.fillType);
        const e2Wc: number = edge2.getWndTypeFilled(this.fillType);

        if (edge1Contributing && edge2Contributing) {
            if (
                edge1Stops ||
                edge2Stops ||
                (e1Wc !== 0 && e1Wc !== 1) ||
                (e2Wc !== 0 && e2Wc !== 1) ||
                edge1.PolyTyp !== edge2.PolyTyp
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

    public fixupIntersectionOrder(): boolean {
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

            this.swapPositionsInSEL(this.intersections[i].Edge1, this.intersections[i].Edge2);
        }

        return true;
    }

    public intersectOpenEdges(edge1: TEdge, edge2: TEdge, isProtect: boolean, point: PointI32) {
        const edge1Stops: boolean = !isProtect && edge1.NextInLML === null && edge1.Top.almostEqual(point);
        const edge2Stops: boolean = !isProtect && edge2.NextInLML === null && edge2.Top.almostEqual(point);
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
            edge1.PolyTyp === edge2.PolyTyp &&
            edge1.WindDelta !== edge2.WindDelta &&
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
        } else if (edge1.PolyTyp !== edge2.PolyTyp) {
            if (
                edge1.isWindDeletaEmpty &&
                Math.abs(edge2.WindCnt) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || edge2.WindCnt2 === 0)
            ) {
                this.outRecManager.addOutPt(edge1, point);

                if (edge1Contributing) {
                    edge1.unassign();
                }
            } else if (
                edge2.isWindDeletaEmpty &&
                Math.abs(edge1.WindCnt) === 1 &&
                (this.clipType !== CLIP_TYPE.UNION || edge1.WindCnt2 === 0)
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
                        this.joinManager.prepareHorzJoins(horzEdge, isTopOfScanbeam);
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

                    this.swapPositionsInAEL(horzEdge, e);
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
                this.joinManager.prepareHorzJoins(horzEdge, isTopOfScanbeam);
            }

            if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
                horzEdge = this.updateEdgeIntoAEL(horzEdge);

                if (horzEdge.isAssigned) {
                    this.outRecManager.addOutPt(horzEdge, horzEdge.Bot);
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
                const op1: NullPtr<OutPt> = this.outRecManager.addOutPt(horzEdge, horzEdge.Top);
                horzEdge = this.updateEdgeIntoAEL(horzEdge);

                if (horzEdge.isWindDeletaEmpty) {
                    return;
                }

                //nb: HorzEdge is no longer horizontal here
                this.joinManager.addHorizontalJoin(op1, horzEdge)
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
                this.activeEdges = horzEdge.deleteFromEL(this.activeEdges, true);
                this.activeEdges = eMaxPair.deleteFromEL(this.activeEdges, true);
            }
        } else {
            if (horzEdge.isAssigned) {
                this.outRecManager.addOutPt(horzEdge, horzEdge.Top);
            }

            this.activeEdges = horzEdge.deleteFromEL(this.activeEdges, true);
        }
    }

    public processHorizontals(isTopOfScanbeam: boolean): void {
        let horzEdge: TEdge = this.sortedEdges;

        while (horzEdge !== null) {
            this.sortedEdges = horzEdge.deleteFromEL(this.sortedEdges, false);

            this.processHorizontal(horzEdge, isTopOfScanbeam);

            horzEdge = this.sortedEdges;
        }
    }

    public processEdgesAtTopOfScanbeam(topY: number, strictlySimple: boolean): void {
        let edge1: TEdge = this.activeEdges;
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
                this.doMaxima(edge1);

                edge1 = edge2 === null ? this.activeEdges : edge2.NextInAEL;
            } else {
                //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
                if (edge1.getIntermediate(topY) && edge1.NextInLML.isHorizontal) {
                    edge1 = this.updateEdgeIntoAEL(edge1);

                    if (edge1.isAssigned) {
                        this.outRecManager.addOutPt(edge1, edge1.Bot);
                    }

                    this.sortedEdges = edge1.addEdgeToSEL(this.sortedEdges);
                } else {
                    edge1.Curr.set(edge1.topX(topY), topY);
                }

                if (strictlySimple) {
                    edge2 = edge1.PrevInAEL;

                    this.joinManager.addScanbeamJoin(edge1, edge2);
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
                outPt1 = edge1.isAssigned ? this.outRecManager.addOutPt(edge1, edge1.Top) : null;
                edge1 = this.updateEdgeIntoAEL(edge1);
                //if output polygons share an edge, they'll need joining later...
                this.joinManager.addSharedJoin(outPt1, edge1);
            }

            edge1 = edge1.NextInAEL;
        }
    }

        private doMaxima(edge: TEdge): void {
            const maxPairEdge: NullPtr<TEdge> = edge.maximaPair;
    
            if (maxPairEdge === null) {
                if (edge.isAssigned) {
                    this.outRecManager.addOutPt(edge, edge.Top);
                }
    
                this.activeEdges = edge.deleteFromEL(this.activeEdges, true);
    
                return;
            }
    
            let nextEdge: NullPtr<TEdge> = edge.NextInAEL;
    
            while (nextEdge !== null && nextEdge !== maxPairEdge) {
                this.intersectEdges(edge, nextEdge, edge.Top, true);
                this.swapPositionsInAEL(edge, nextEdge);
                nextEdge = edge.NextInAEL;
            }
    
            if (!edge.isAssigned && !maxPairEdge.isAssigned) {
                this.activeEdges = edge.deleteFromEL(this.activeEdges, true);
                this.activeEdges = maxPairEdge.deleteFromEL(this.activeEdges, true);
            } else if (edge.isAssigned && maxPairEdge.isAssigned) {
                this.intersectEdges(edge, maxPairEdge, edge.Top, false);
            } else if (edge.isWindDeletaEmpty) {
                if (edge.isAssigned) {
                    this.outRecManager.addOutPt(edge, edge.Top);
                    edge.unassign();
                }
    
                this.activeEdges = edge.deleteFromEL(this.activeEdges, true);
    
                if (maxPairEdge.isAssigned) {
                    this.outRecManager.addOutPt(maxPairEdge, edge.Top);
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
            this.intersectEdges(node.Edge1, node.Edge2, node.Pt, true);
            this.swapPositionsInAEL(node.Edge1, node.Edge2);
        }

        this.intersections = [];
    }

    public processIntersections(botY: number, topY: number): boolean {
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

    public insertLocalMinimaIntoAEL(botY: number, localMinimaManager: LocalMinimaManager): void {
        let outPt: OutPt = null;

        while (!Number.isNaN(localMinimaManager.y) && localMinimaManager.y === botY) {
            let [leftBound, rightBound] = localMinimaManager.pop();
            outPt = null;

            if (leftBound === null) {
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges);
                rightBound.setWindingCount(this.activeEdges, this.clipType);

                if (rightBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(rightBound, rightBound.Bot);
                }
            } else if (rightBound === null) {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                leftBound.setWindingCount(this.activeEdges, this.clipType);

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.outRecManager.addOutPt(leftBound, leftBound.Bot);
                }

                this.scanbeam.insert(leftBound.Top.y);
            } else {
                this.activeEdges = leftBound.insertEdgeIntoAEL(this.activeEdges);
                this.activeEdges = rightBound.insertEdgeIntoAEL(this.activeEdges, leftBound);
                leftBound.setWindingCount(this.activeEdges, this.clipType);
                rightBound.WindCnt = leftBound.WindCnt;
                rightBound.WindCnt2 = leftBound.WindCnt2;

                if (leftBound.getContributing(this.clipType, this.fillType)) {
                    outPt = this.joinManager.addLocalMinPoly(leftBound, rightBound, leftBound.Bot);
                }

                this.scanbeam.insert(leftBound.Top.y);
            }

            if (rightBound !== null) {
                if (rightBound.isHorizontal) {
                    this.sortedEdges = rightBound.addEdgeToSEL(this.sortedEdges);
                } else {
                    this.scanbeam.insert(rightBound.Top.y);
                }
            }

            if (leftBound === null || rightBound === null) {
                continue;
            }
            //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
            this.joinManager.addOutputJoins(outPt, rightBound);

            this.joinManager.addLeftJoin(outPt, leftBound);

            if (leftBound.NextInAEL !== rightBound) {
                this.joinManager.addRightJoin(outPt, rightBound);

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

}