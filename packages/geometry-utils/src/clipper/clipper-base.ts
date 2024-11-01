import Point from '../point';
import LocalMinima from './local-minima';
import TEdge from './t-edge';
import { DIRECTION, POLY_TYPE } from './types';

export default class ClipperBase {
    protected minimaList: LocalMinima = null;
    protected isUseFullRange: boolean = false;
    protected currentLM: LocalMinima = null;

    public addPath(polygon: Point[], polyType: POLY_TYPE): boolean {
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

        this.isUseFullRange = Point.rangeTest(polygon[0], this.isUseFullRange);
        this.isUseFullRange = Point.rangeTest(polygon[lastIndex], this.isUseFullRange);

        edges[0].init(edges[1], edges[lastIndex], polygon[0]);
        edges[lastIndex].init(edges[0], edges[lastIndex - 1], polygon[lastIndex]);

        for (i = lastIndex - 1; i >= 1; --i) {
            this.isUseFullRange = Point.rangeTest(polygon[i], this.isUseFullRange);

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

            if (Point.slopesEqual(edge.Prev.Curr, edge.Curr, edge.Next.Curr, this.isUseFullRange)) {
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
            //E and E.Prev now share a local minima (left aligned if horizontal).
            //Compare their slopes to find which starts which bound ...
            isClockwise = edge.Dx >= edge.Prev.Dx;
            const locMin: LocalMinima = isClockwise
                ? //Q.nextInLML = Q.next
                  new LocalMinima(edge.Bot.y, edge, edge.Prev)
                : //Q.nextInLML = Q.prev
                  new LocalMinima(edge.Bot.y, edge.Prev, edge);

            locMin.leftBound.Side = DIRECTION.LEFT;
            locMin.rightBound.Side = DIRECTION.RIGHT;
            locMin.leftBound.WindDelta = locMin.leftBound.Next === locMin.rightBound ? -1 : 1;
            locMin.rightBound.WindDelta = -locMin.leftBound.WindDelta;

            edge = this.ProcessBound(locMin.leftBound, isClockwise);

            const edge2: TEdge = this.ProcessBound(locMin.rightBound, !isClockwise);

            this.minimaList = locMin.insert(this.minimaList);

            if (!isClockwise) {
                edge = edge2;
            }
        }

        return true;
    }

    public addPaths(polygons: Point[][], polyType: POLY_TYPE): boolean {
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

    private ProcessBound(edge: TEdge, isClockwise: boolean) {
        let startEdge: TEdge = edge;
        let result: TEdge = edge;
        let horzEdge: TEdge = null;

        if (edge.isDxHorizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const startX: number = isClockwise ? edge.Prev.Bot.x : edge.Next.Bot.x;

            if (edge.Bot.x !== startX) {
                edge.reverseHorizontal();
            }
        }

        if (isClockwise) {
            while (result.Top.y === result.Next.Bot.y) {
                result = result.Next;
            }

            if (result.isDxHorizontal) {
                //nb: at the top of a bound, horizontals are added to the bound
                //only when the preceding edge attaches to the horizontal's left vertex
                //unless a Skip edge is encountered when that becomes the top divide
                horzEdge = result;

                while (horzEdge.Prev.isDxHorizontal) {
                    horzEdge = horzEdge.Prev;
                }

                if (horzEdge.Prev.Top.x === result.Next.Top.x) {
                    if (!isClockwise) {
                        result = horzEdge.Prev;
                    }
                } else if (horzEdge.Prev.Top.x > result.Next.Top.x) {
                    result = horzEdge.Prev;
                }
            }

            while (edge !== result) {
                edge.NextInLML = edge.Next;

                if (edge.isDxHorizontal && edge !== startEdge && edge.Bot.x !== edge.Prev.Top.x) {
                    edge.reverseHorizontal();
                }

                edge = edge.Next;
            }

            if (edge.isDxHorizontal && edge !== startEdge && edge.Bot.x !== edge.Prev.Top.x) {
                edge.reverseHorizontal();
            }

            result = result.Next;
            //move to the edge just beyond current bound
        } else {
            while (result.Top.y === result.Prev.Bot.y) {
                result = result.Prev;
            }

            if (result.isDxHorizontal) {
                horzEdge = result;

                while (horzEdge.Next.isDxHorizontal) {
                    horzEdge = horzEdge.Next;
                }

                if (horzEdge.Next.Top.x === result.Prev.Top.x) {
                    if (!isClockwise) {
                        result = horzEdge.Next;
                    }
                } else if (horzEdge.Next.Top.x > result.Prev.Top.x) {
                    result = horzEdge.Next;
                }
            }

            while (edge !== result) {
                edge.NextInLML = edge.Prev;

                if (edge.isDxHorizontal && edge !== startEdge && edge.Bot.x !== edge.Next.Top.x) {
                    edge.reverseHorizontal();
                }

                edge = edge.Prev;
            }

            if (edge.isDxHorizontal && edge !== startEdge && edge.Bot.x !== edge.Next.Top.x) {
                edge.reverseHorizontal();
            }

            result = result.Prev;
            //move to the edge just beyond current bound
        }

        return result;
    }

    protected reset(): void {
        this.currentLM = this.minimaList;

        if (this.currentLM !== null) {
            //ie nothing to process
            //reset all edges ...
            this.minimaList.reset();
        }
    }
}
