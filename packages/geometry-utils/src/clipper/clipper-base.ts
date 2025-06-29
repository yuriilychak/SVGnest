import { PointI32 } from '../geometry';
import LocalMinimaManager from './local-minima-manager';
import TEdge from './t-edge';
import { POLY_TYPE } from './types';

export default class ClipperBase {
    protected isUseFullRange: boolean = false;
    protected localMinimaManager: LocalMinimaManager = new LocalMinimaManager();

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
}
