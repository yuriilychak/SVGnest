import { PointI32 } from "../geometry";
import LocalMinima from "./local-minima";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";
import { DIRECTION, POLY_TYPE } from "./types";

export default class LocalMinimaManager {
    private minimaList: LocalMinima[] = [];
    public isUseFullRange: boolean = false;

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

        this.addEdgeBounds(edge);

        return true;
    }

    public addEdgeBounds(edge: TEdge): void {
        let isClockwise: boolean = false;
        let minEdge: TEdge = null;

        while (true) {
            edge = edge.findNextLocMin();

            if (edge === minEdge) {
                break;
            }

            if (minEdge === null) {
                minEdge = edge;
            }

            isClockwise = edge.Dx >= edge.Prev.Dx;
            const localMinima: LocalMinima = new LocalMinima(edge);

            edge = localMinima.leftBound.processBound(isClockwise);
            const edge2: TEdge = localMinima.rightBound.processBound(!isClockwise);

            this.insert(localMinima);

            if (!isClockwise) {
                edge = edge2;
            }
        }
    }

    private insert(localMinima: LocalMinima): void {
        for (let i = 0; i < this.minimaList.length; ++i) {
            if (localMinima.y >= this.minimaList[i].y) {
                this.minimaList.splice(i, 0, localMinima);
                return;
            }
        }
        
        this.minimaList.push(localMinima);
    }

    public reset(): void {
        for (const minima of this.minimaList) {
            if (minima.leftBound !== null) {
                minima.leftBound.reset(DIRECTION.LEFT);
            }
            if (minima.rightBound !== null) {
                minima.rightBound.reset(DIRECTION.RIGHT);
            }
        }
    }

    public getScanbeam(scanbeam: Scanbeam): void {
        for (const minima of this.minimaList) {
            scanbeam.insert(minima.y);
        }
    }

    public pop(): TEdge[] {
        if (this.isEmpty) {
            throw new Error("No minima to pop");
        }

        const minima = this.minimaList.shift()!;
        return [minima.leftBound, minima.rightBound];
    }

    public get isEmpty(): boolean {
        return this.minimaList.length === 0;
    }

    public get y(): number {
        return this.isEmpty ? NaN : this.minimaList[0].y;
    }
}
