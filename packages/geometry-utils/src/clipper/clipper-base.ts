import { Cast_Int64, mulInt128, op_EqualityInt128, op_Equality, Pt2IsBetweenPt1AndPt3 } from './helpers';
import LocalMinima from './local-minima';
import TEdge from './t-edge';
import { EdgeSide, IntPoint, PolyType } from './types';

export default class ClipperBase {
    private m_CurrentLM: LocalMinima = null;
    private m_edges: TEdge[][] = [];
    private PreserveCollinear: boolean = false;
    private m_MinimaList: LocalMinima = null;
    private m_UseFullRange: boolean = false;
    private m_HasOpenPaths: boolean = false;

    public AddPath(polygon: IntPoint[], polyType: PolyType, isClosed: boolean): boolean {
        if (!isClosed && polyType == PolyType.ptClip) {
            ClipperBase.Error('AddPath: Open paths must be subject.');
        }

        let lastIndex = polygon.length - 1;

        if (isClosed) {
            while (lastIndex > 0 && op_Equality(polygon[lastIndex], polygon[0])) {
                --lastIndex;
            }
        }

        while (lastIndex > 0 && op_Equality(polygon[lastIndex], polygon[lastIndex - 1])) {
            --lastIndex;
        }

        if ((isClosed && lastIndex < 2) || (!isClosed && lastIndex < 1)) {
            return false;
        }
        //create a new edge array ...
        const edges: TEdge[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            edges.push(new TEdge());
        }

        let isFlat: boolean = true;
        //1. Basic (first) edge initialization ...

        //edges[1].Curr = pg[1];
        edges[1].Curr.X = polygon[1].X;
        edges[1].Curr.Y = polygon[1].Y;

        this.m_UseFullRange = ClipperBase.RangeTest(polygon[0], this.m_UseFullRange);
        this.m_UseFullRange = ClipperBase.RangeTest(polygon[lastIndex], this.m_UseFullRange);

        edges[0].init(edges[1], edges[lastIndex], polygon[0]);
        edges[lastIndex].init(edges[0], edges[lastIndex - 1], polygon[lastIndex]);

        for (i = lastIndex - 1; i >= 1; --i) {
            this.m_UseFullRange = ClipperBase.RangeTest(polygon[i], this.m_UseFullRange);

            edges[i].init(edges[i + 1], edges[i - 1], polygon[i]);
        }

        let startEdge: TEdge = edges[0];
        //2. Remove duplicate vertices, and (when closed) collinear edges ...
        let edge: TEdge = startEdge;
        let loopStopEdge: TEdge = startEdge;

        while (true) {
            if (op_Equality(edge.Curr, edge.Next.Curr)) {
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

            if (
                isClosed &&
                ClipperBase.SlopesEqualPoints(edge.Prev.Curr, edge.Curr, edge.Next.Curr, this.m_UseFullRange) &&
                (!this.PreserveCollinear || !Pt2IsBetweenPt1AndPt3(edge.Prev.Curr, edge.Curr, edge.Next.Curr))
            ) {
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

        if ((!isClosed && edge === edge.Next) || (isClosed && edge.Prev === edge.Next)) {
            return false;
        }

        if (!isClosed) {
            this.m_HasOpenPaths = true;
            startEdge.Prev.OutIdx = ClipperBase.Skip;
        }
        //3. Do second stage of edge initialization ...
        edge = startEdge;

        do {
            edge.initFromPolyType(polyType);
            edge = edge.Next;

            if (isFlat && edge.Curr.Y != startEdge.Curr.Y) {
                isFlat = false;
            }
        } while (edge !== startEdge);
        //4. Finally, add edge bounds to LocalMinima list ...
        //Totally flat paths must be handled differently when adding them
        //to LocalMinima list to avoid endless loops etc ...
        if (isFlat) {
            if (isClosed) {
                return false;
            }

            edge.Prev.OutIdx = ClipperBase.Skip;

            if (edge.Prev.Bot.X < edge.Prev.Top.X) {
                edge.Prev.reverseHorizontal();
            }

            const locMin: LocalMinima = new LocalMinima(edge.Bot.Y, null, edge);

            locMin.RightBound.Side = EdgeSide.esRight;
            locMin.RightBound.WindDelta = 0;

            while (edge.Next.OutIdx !== ClipperBase.Skip) {
                edge.NextInLML = edge.Next;

                if (edge.Bot.X !== edge.Prev.Top.X) {
                    edge.reverseHorizontal();
                }

                edge = edge.Next;
            }

            this.InsertLocalMinima(locMin);
            this.m_edges.push(edges);

            return true;
        }

        this.m_edges.push(edges);

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
                  new LocalMinima(edge.Bot.Y, edge, edge.Prev)
                : //Q.nextInLML = Q.prev
                  new LocalMinima(edge.Bot.Y, edge.Prev, edge);

            locMin.LeftBound.Side = EdgeSide.esLeft;
            locMin.RightBound.Side = EdgeSide.esRight;

            if (!isClosed) {
                locMin.LeftBound.WindDelta = 0;
            } else if (locMin.LeftBound.Next == locMin.RightBound) {
                locMin.LeftBound.WindDelta = -1;
            } else {
                locMin.LeftBound.WindDelta = 1;
            }

            locMin.RightBound.WindDelta = -locMin.LeftBound.WindDelta;
            edge = this.ProcessBound(locMin.LeftBound, isClockwise);

            const edge2: TEdge = this.ProcessBound(locMin.RightBound, !isClockwise);
            if (locMin.LeftBound.OutIdx == ClipperBase.Skip) {
                locMin.LeftBound = null;
            } else if (locMin.RightBound.OutIdx == ClipperBase.Skip) {
                locMin.RightBound = null;
            }

            this.InsertLocalMinima(locMin);

            if (!isClockwise) {
                edge = edge2;
            }
        }

        return true;
    }

    public AddPaths(polygons: IntPoint[][], polyType: PolyType, isClosed: boolean): boolean {
        //  console.log("-------------------------------------------");
        //  console.log(JSON.stringify(ppg));
        const polygonCount: number = polygons.length;
        let result: boolean = false;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            if (this.AddPath(polygons[i], polyType, isClosed)) {
                result = true;
            }
        }

        return result;
    }

    private InsertLocalMinima(nextLocalMinima: LocalMinima): void {
        if (this.m_MinimaList === null) {
            this.m_MinimaList = nextLocalMinima;
        } else if (nextLocalMinima.Y >= this.m_MinimaList.Y) {
            nextLocalMinima.Next = this.m_MinimaList;
            this.m_MinimaList = nextLocalMinima;
        } else {
            let localMinima: LocalMinima = this.m_MinimaList;

            while (localMinima.Next !== null && nextLocalMinima.Y < localMinima.Next.Y) {
                localMinima = localMinima.Next;
            }

            nextLocalMinima.Next = localMinima.Next;
            localMinima.Next = nextLocalMinima;
        }
    }

    private ProcessBound(edge: TEdge, isClockwise: boolean) {
        let startEdge: TEdge = edge;
        let result: TEdge = edge;
        let horzEdge: TEdge = null;

        if (edge.Dx == ClipperBase.horizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const startX: number = isClockwise ? edge.Prev.Bot.X : edge.Next.Bot.X;

            if (edge.Bot.X != startX) {
                edge.reverseHorizontal();
            }
        }

        if (result.OutIdx != ClipperBase.Skip) {
            if (isClockwise) {
                while (result.Top.Y == result.Next.Bot.Y && result.Next.OutIdx != ClipperBase.Skip) {
                    result = result.Next;
                }

                if (result.Dx == ClipperBase.horizontal && result.Next.OutIdx != ClipperBase.Skip) {
                    //nb: at the top of a bound, horizontals are added to the bound
                    //only when the preceding edge attaches to the horizontal's left vertex
                    //unless a Skip edge is encountered when that becomes the top divide
                    horzEdge = result;

                    while (horzEdge.Prev.Dx == ClipperBase.horizontal) {
                        horzEdge = horzEdge.Prev;
                    }

                    if (horzEdge.Prev.Top.X == result.Next.Top.X) {
                        if (!isClockwise) {
                            result = horzEdge.Prev;
                        }
                    } else if (horzEdge.Prev.Top.X > result.Next.Top.X) {
                        result = horzEdge.Prev;
                    }
                }

                while (edge != result) {
                    edge.NextInLML = edge.Next;

                    if (edge.Dx == ClipperBase.horizontal && edge != startEdge && edge.Bot.X != edge.Prev.Top.X) {
                        edge.reverseHorizontal();
                    }

                    edge = edge.Next;
                }

                if (edge.Dx == ClipperBase.horizontal && edge != startEdge && edge.Bot.X != edge.Prev.Top.X) {
                    edge.reverseHorizontal();
                }

                result = result.Next;
                //move to the edge just beyond current bound
            } else {
                while (result.Top.Y == result.Prev.Bot.Y && result.Prev.OutIdx != ClipperBase.Skip) result = result.Prev;
                if (result.Dx == ClipperBase.horizontal && result.Prev.OutIdx != ClipperBase.Skip) {
                    horzEdge = result;

                    while (horzEdge.Next.Dx == ClipperBase.horizontal) {
                        horzEdge = horzEdge.Next;
                    }

                    if (horzEdge.Next.Top.X == result.Prev.Top.X) {
                        if (!isClockwise) {
                            result = horzEdge.Next;
                        }
                    } else if (horzEdge.Next.Top.X > result.Prev.Top.X) {
                        result = horzEdge.Next;
                    }
                }

                while (edge != result) {
                    edge.NextInLML = edge.Prev;

                    if (edge.Dx == ClipperBase.horizontal && edge != startEdge && edge.Bot.X != edge.Next.Top.X) {
                        edge.reverseHorizontal();
                    }

                    edge = edge.Prev;
                }

                if (edge.Dx == ClipperBase.horizontal && edge != startEdge && edge.Bot.X != edge.Next.Top.X) {
                    edge.reverseHorizontal();
                }

                result = result.Prev;
                //move to the edge just beyond current bound
            }
        }

        if (result.OutIdx == ClipperBase.Skip) {
            //if edges still remain in the current bound beyond the skip edge then
            //create another LocMin and call ProcessBound once more
            edge = result;
            if (isClockwise) {
                while (edge.Top.Y == edge.Next.Bot.Y) {
                    edge = edge.Next;
                }
                //don't include top horizontals when parsing a bound a second time,
                //they will be contained in the opposite bound ...
                while (edge != result && edge.Dx == ClipperBase.horizontal) {
                    edge = edge.Prev;
                }
            } else {
                while (edge.Top.Y == edge.Prev.Bot.Y) {
                    edge = edge.Prev;
                }

                while (edge != result && edge.Dx == ClipperBase.horizontal) {
                    edge = edge.Next;
                }
            }

            if (edge == result) {
                result = isClockwise ? edge.Next : edge.Prev;
            } else {
                //there are more edges in the bound beyond result starting with E
                edge = isClockwise ? result.Next : result.Prev;

                const locMin: LocalMinima = new LocalMinima(edge.Bot.Y, null, edge);

                locMin.RightBound.WindDelta = 0;
                result = this.ProcessBound(locMin.RightBound, isClockwise);

                this.InsertLocalMinima(locMin);
            }
        }

        return result;
    }

    public static Error(message: string): void {
        try {
            throw new Error(message);
        } catch (err) {
            console.warn(err.message);
        }
    }

    public static RangeTest(point: IntPoint, useFullRange: boolean): boolean {
        if (useFullRange) {
            if (
                point.X > ClipperBase.hiRange ||
                point.Y > ClipperBase.hiRange ||
                -point.X > ClipperBase.hiRange ||
                -point.Y > ClipperBase.hiRange
            ) {
                ClipperBase.Error('Coordinate outside allowed range in RangeTest().');
            }
        } else if (
            point.X > ClipperBase.loRange ||
            point.Y > ClipperBase.loRange ||
            -point.X > ClipperBase.loRange ||
            -point.Y > ClipperBase.loRange
        ) {
            return this.RangeTest(point, true);
        }

        return useFullRange;
    }

    public static SlopesEqualPoints(pt1: IntPoint, pt2: IntPoint, pt3: IntPoint, useFullRange: boolean) {
        return useFullRange
            ? op_EqualityInt128(mulInt128(pt1.Y - pt2.Y, pt2.X - pt3.X), mulInt128(pt1.X - pt2.X, pt2.Y - pt3.Y))
            : Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) - Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) === 0;
    }

    public static horizontal = -9007199254740992; //-2^53
    public static Skip = -2;
    public static Unassigned = -1;
    public static tolerance = 1e-20;
    public static loRange = 47453132; // sqrt(2^53 -1)/2
    public static hiRange = 4503599627370495; // sqrt(2^106 -1)/2
}
