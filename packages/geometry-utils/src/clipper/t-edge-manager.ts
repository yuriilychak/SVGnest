import { PointI32 } from "../geometry";
import { showError } from "./helpers";
import IntersectNode from "./intersect-node";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";
import { NullPtr } from "./types";

export default class TEdgeManager {
    public activeEdges: TEdge = null;
    public sortedEdges: TEdge = null;
    public intersections: IntersectNode[] = [];

    public updateEdgeIntoAEL(edge: TEdge, scanbeam: Scanbeam): NullPtr<TEdge> {
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
            scanbeam.insert(edge.Top.y);
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

    public buildIntersectList(botY: number, topY: number, isUseFullRange: boolean): void {
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
                        !TEdge.intersectPoint(edge, nextEdge, point, isUseFullRange) &&
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
}