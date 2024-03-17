import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from "./enums";
import GhostJoinStore from "./ghost-join-store";
import IntPoint from "./int-point";
import IntersectNode from "./intersect-node";
import Join from "./join";
import LocalMinima from "./local-minima";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";

interface DirData {
  Left: number | null;
  Right: number | null;
  Dir: Direction | null;
}

export default class Clipper {
  private _MinimaList: LocalMinima = null;
  private _CurrentLM: LocalMinima = null;
  private _edges: TEdge[][] = [];
  private _useFullRange: boolean = false;
  private _hasOpenPaths: boolean = false;
  private _preserveCollinear: boolean = false;
  private _clipType: ClipType = ClipType.Intersection;
  private _scanbeam: Scanbeam = null;
  private _activeEdges: TEdge = null;
  private _sortedEdges: TEdge = null;
  private _executeLocked: boolean = false;
  private _clipFillType: PolyFillType = PolyFillType.EvenOdd;
  private _subjFillType: PolyFillType = PolyFillType.EvenOdd;
  public reverseSolution: boolean = false;
  public strictlySimple: boolean = false;
  private _intersections: IntersectNode[] = [];
  private _joins: Join[] = [];
  private _outPolygon: OutPolygon;
  private _ghostJoinStore: GhostJoinStore;

  constructor(InitOptions: number = 0) {
    this.reverseSolution = (1 & InitOptions) !== 0;
    this.strictlySimple = (2 & InitOptions) !== 0;
    this._preserveCollinear = (4 & InitOptions) !== 0;
    this._outPolygon = new OutPolygon();
    this._ghostJoinStore = new GhostJoinStore();
  }

  public addPaths(
    ppg: IntPoint[][],
    polyType: PolyType,
    closed: boolean
  ): boolean {
    let result: boolean = false;
    const polygonCount: number = ppg.length;
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
      if (this.addPath(ppg[i], polyType, closed)) {
        result = true;
      }
    }
    return result;
  }

  public addPath(
    polygon: IntPoint[],
    polyType: PolyType,
    isClosed: boolean
  ): boolean {
    if (!isClosed && polyType == PolyType.Clip) {
      console.error("AddPath: Open paths must be subject.");
    }

    const lastIndex: number = Clipper._getPolygonLastIndex(polygon, isClosed);

    if ((isClosed && lastIndex < 2) || (!isClosed && lastIndex < 1)) {
      return false;
    }
    //create a new edge array ...
    const edges: TEdge[] = [];
    let i: number = 0;
    let isFlat: boolean = true;

    for (i = 0; i <= lastIndex; ++i) {
      edges.push(new TEdge());
    }

    //1. Basic (first) edge initialization ...

    //edges[1].Curr = pg[1];
    edges[1].Curr.set(polygon[1]);

    this._useFullRange = polygon[0].rangeTest(this._useFullRange);
    this._useFullRange = polygon[lastIndex].rangeTest(this._useFullRange);

    edges[0].init(edges[1], edges[lastIndex], polygon[0]);
    edges[lastIndex].init(edges[0], edges[lastIndex - 1], polygon[lastIndex]);

    for (i = lastIndex - 1; i >= 1; --i) {
      this._useFullRange = polygon[i].rangeTest(this._useFullRange);

      edges[i].init(edges[i + 1], edges[i - 1], polygon[i]);
    }

    let startEdge: TEdge = edges[0];
    //2. Remove duplicate vertices, and (when closed) collinear edges ...
    let edge1: TEdge = startEdge;
    let edge2: TEdge;
    let loopStopEdge: TEdge = startEdge;

    while (true) {
      if (edge1.Curr.equal(edge1.Next.Curr)) {
        if (edge1 == edge1.Next) {
          break;
        }

        if (edge1 == startEdge) {
          startEdge = edge1.Next;
        }

        edge1 = edge1.remove();
        loopStopEdge = edge1;
        continue;
      }

      if (edge1.Prev == edge1.Next) {
        break;
      }

      if (
        isClosed &&
        IntPoint.slopesEqual(
          edge1.Prev.Curr,
          edge1.Curr,
          edge1.Next.Curr,
          this._useFullRange
        ) &&
        (!this._preserveCollinear ||
          !edge1.Curr.between(edge1.Prev.Curr, edge1.Next.Curr))
      ) {
        //Collinear edges are allowed for open paths but in closed paths
        //the default is to merge adjacent collinear edges into a single edge.
        //However, if the PreserveCollinear property is enabled, only overlapping
        //collinear edges (ie spikes) will be removed from closed paths.
        if (edge1 == startEdge) {
          startEdge = edge1.Next;
        }
        edge1 = edge1.remove();
        edge1 = edge1.Prev;
        loopStopEdge = edge1;
        continue;
      }

      edge1 = edge1.Next;

      if (edge1 == loopStopEdge) {
        break;
      }
    }

    if (
      (!isClosed && edge1 == edge1.Next) ||
      (isClosed && edge1.Prev == edge1.Next)
    ) {
      return false;
    }
    if (!isClosed) {
      this._hasOpenPaths = true;
      startEdge.Prev.OutIdx = Clipper.Skip;
    }
    //3. Do second stage of edge initialization ...
    edge1 = startEdge;

    do {
      edge1.initFromPolyType(polyType);
      edge1 = edge1.Next;

      if (isFlat && edge1.Curr.Y != startEdge.Curr.Y) {
        isFlat = false;
      }
    } while (edge1 != startEdge);

    //4. Finally, add edge bounds to LocalMinima list ...
    //Totally flat paths must be handled differently when adding them
    //to LocalMinima list to avoid endless loops etc ...
    if (isFlat) {
      if (isClosed) {
        return false;
      }

      edge1.Prev.OutIdx = Clipper.Skip;

      if (edge1.Prev.Bot.X < edge1.Prev.Top.X) {
        edge1.Prev.reverseHorizontal();
      }
      const locMin: LocalMinima = new LocalMinima(edge1.Bot.Y, null, edge1);
      locMin.RightBound.Side = EdgeSide.Right;
      locMin.RightBound.WindDelta = 0;

      while (edge1.Next.OutIdx != Clipper.Skip) {
        edge1.NextInLML = edge1.Next;

        if (edge1.Bot.X != edge1.Prev.Top.X) {
          edge1.reverseHorizontal();
        }

        edge1 = edge1.Next;
      }

      this._insertLocalMinima(locMin);
      this._edges.push(edges);
      return true;
    }

    this._edges.push(edges);

    let isClockwise: boolean = false;
    let minEdge: TEdge = null;
    let localMinima: LocalMinima;

    while (true) {
      edge1 = edge1.nextLocMin;

      if (edge1 === minEdge) {
        break;
      }

      if (minEdge == null) {
        minEdge = edge1;
      }
      //E and E.Prev now share a local minima (left aligned if horizontal).
      //Compare their slopes to find which starts which bound ...
      isClockwise = edge1.Dx >= edge1.Prev.Dx;

      localMinima = new LocalMinima(edge1.Bot.Y);
      localMinima.init(edge1, isClockwise, isClosed);

      edge1 = this._processBound(localMinima.LeftBound, isClockwise);
      edge2 = this._processBound(localMinima.RightBound, !isClockwise);

      localMinima.clean();
      this._insertLocalMinima(localMinima);
      if (!isClockwise) {
        edge1 = edge2;
      }
    }
    return true;
  }

  private _processBound(edge: TEdge, isClockwise: boolean): TEdge {
    let startEdge: TEdge = edge;
    let result: TEdge = edge;
    let hEdge: TEdge;
    let startX: number = 0;
    let locMin: LocalMinima;

    if (edge.Dx == Clipper.horizontal) {
      //it's possible for adjacent overlapping horz edges to start heading left
      //before finishing right, so ...
      startX = isClockwise ? edge.Prev.Bot.X : edge.Next.Bot.X;

      if (edge.Bot.X !== startX) {
        edge.reverseHorizontal();
      }
    }

    if (result.OutIdx != Clipper.Skip) {
      if (isClockwise) {
        while (
          result.Top.Y == result.Next.Bot.Y &&
          result.Next.OutIdx != Clipper.Skip
        ) {
          result = result.Next;
        }

        if (
          result.Dx == Clipper.horizontal &&
          result.Next.OutIdx != Clipper.Skip
        ) {
          //nb: at the top of a bound, horizontals are added to the bound
          //only when the preceding edge attaches to the horizontal's left vertex
          //unless a Skip edge is encountered when that becomes the top divide
          hEdge = result;

          while (hEdge.Prev.Dx == Clipper.horizontal) {
            hEdge = hEdge.Prev;
          }

          if (hEdge.Prev.Top.X == result.Next.Top.X) {
            if (!isClockwise) {
              result = hEdge.Prev;
            }
          } else if (hEdge.Prev.Top.X > result.Next.Top.X) {
            result = hEdge.Prev;
          }
        }

        while (edge != result) {
          edge.NextInLML = edge.Next;

          if (
            edge.Dx == Clipper.horizontal &&
            edge != startEdge &&
            edge.Bot.X != edge.Prev.Top.X
          ) {
            edge.reverseHorizontal();
          }

          edge = edge.Next;
        }

        if (
          edge.Dx == Clipper.horizontal &&
          edge != startEdge &&
          edge.Bot.X != edge.Prev.Top.X
        ) {
          edge.reverseHorizontal();
        }

        result = result.Next;
        //move to the edge just beyond current bound
      } else {
        while (
          result.Top.Y == result.Prev.Bot.Y &&
          result.Prev.OutIdx != Clipper.Skip
        )
          result = result.Prev;
        if (
          result.Dx == Clipper.horizontal &&
          result.Prev.OutIdx != Clipper.Skip
        ) {
          hEdge = result;

          while (hEdge.Next.Dx == Clipper.horizontal) {
            hEdge = hEdge.Next;
          }

          if (hEdge.Next.Top.X == result.Prev.Top.X) {
            if (!isClockwise) {
              result = hEdge.Next;
            }
          } else if (hEdge.Next.Top.X > result.Prev.Top.X) {
            result = hEdge.Next;
          }
        }

        while (edge != result) {
          edge.NextInLML = edge.Prev;

          if (
            edge.Dx == Clipper.horizontal &&
            edge != startEdge &&
            edge.Bot.X != edge.Next.Top.X
          ) {
            edge.reverseHorizontal();
          }
          edge = edge.Prev;
        }

        if (
          edge.Dx == Clipper.horizontal &&
          edge != startEdge &&
          edge.Bot.X != edge.Next.Top.X
        ) {
          edge.reverseHorizontal();
        }
        result = result.Prev;
        //move to the edge just beyond current bound
      }
    }

    if (result.OutIdx == Clipper.Skip) {
      //if edges still remain in the current bound beyond the skip edge then
      //create another LocMin and call ProcessBound once more
      edge = result;

      if (isClockwise) {
        while (edge.Top.Y == edge.Next.Bot.Y) {
          edge = edge.Next;
        }
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge != result && edge.Dx == Clipper.horizontal) {
          edge = edge.Prev;
        }
      } else {
        while (edge.Top.Y == edge.Prev.Bot.Y) {
          edge = edge.Prev;
        }

        while (edge != result && edge.Dx == Clipper.horizontal) {
          edge = edge.Next;
        }
      }
      if (edge == result) {
        result = isClockwise ? edge.Next : edge.Prev;
      } else {
        //there are more edges in the bound beyond result starting with E

        edge = isClockwise ? result.Next : result.Prev;

        locMin = new LocalMinima(edge.Bot.Y, null, edge);
        locMin.RightBound.WindDelta = 0;
        result = this._processBound(locMin.RightBound, isClockwise);
        this._insertLocalMinima(locMin);
      }
    }

    return result;
  }

  private _insertLocalMinima(localMinima: LocalMinima): void {
    this._MinimaList =
      this._MinimaList === null
        ? localMinima
        : this._MinimaList.insert(localMinima);
  }

  public execute(
    clipType: ClipType,
    solution: IntPoint[][],
    subjFillType: PolyFillType,
    clipFillType: PolyFillType
  ): boolean {
    if (this._executeLocked) return false;
    if (this._hasOpenPaths)
      console.error("Error: PolyTree struct is need for open path clipping.");
    this._executeLocked = true;
    Clipper.Clear(solution);
    this._subjFillType = subjFillType;
    this._clipFillType = clipFillType;
    this._clipType = clipType;

    try {
      var succeeded = this._execute();
      //build the return polygons ...
      if (succeeded) this._outPolygon.build(solution);
    } finally {
      this._outPolygon.dispose();
      this._executeLocked = false;
    }
    return succeeded;
  }

  public SwapPositionsInAEL(edge1: TEdge, edge2: TEdge): void {
    //check that one or other edge hasn't already been removed from AEL ...
    if (
      edge1.NextInAEL == edge1.PrevInAEL ||
      edge2.NextInAEL == edge2.PrevInAEL
    )
      return;
    if (edge1.NextInAEL == edge2) {
      var next = edge2.NextInAEL;
      if (next !== null) next.PrevInAEL = edge1;
      var prev = edge1.PrevInAEL;
      if (prev !== null) prev.NextInAEL = edge2;
      edge2.PrevInAEL = prev;
      edge2.NextInAEL = edge1;
      edge1.PrevInAEL = edge2;
      edge1.NextInAEL = next;
    } else if (edge2.NextInAEL == edge1) {
      var next = edge1.NextInAEL;
      if (next !== null) next.PrevInAEL = edge2;
      var prev = edge2.PrevInAEL;
      if (prev !== null) prev.NextInAEL = edge1;
      edge1.PrevInAEL = prev;
      edge1.NextInAEL = edge2;
      edge2.PrevInAEL = edge1;
      edge2.NextInAEL = next;
    } else {
      var next = edge1.NextInAEL;
      var prev = edge1.PrevInAEL;
      edge1.NextInAEL = edge2.NextInAEL;
      if (edge1.NextInAEL !== null) edge1.NextInAEL.PrevInAEL = edge1;
      edge1.PrevInAEL = edge2.PrevInAEL;
      if (edge1.PrevInAEL !== null) edge1.PrevInAEL.NextInAEL = edge1;
      edge2.NextInAEL = next;
      if (edge2.NextInAEL !== null) edge2.NextInAEL.PrevInAEL = edge2;
      edge2.PrevInAEL = prev;
      if (edge2.PrevInAEL !== null) edge2.PrevInAEL.NextInAEL = edge2;
    }

    if (edge1.PrevInAEL === null) {
      this._activeEdges = edge1;
    } else if (edge2.PrevInAEL === null) {
      this._activeEdges = edge2;
    }
  }

  public IntersectEdges(
    e1: TEdge,
    e2: TEdge,
    pt: IntPoint,
    protect: boolean
  ): void {
    //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
    //e2 in AEL except when e1 is being inserted at the intersection point ...
    var e1stops =
      !protect && e1.NextInLML === null && e1.Top.X == pt.X && e1.Top.Y == pt.Y;
    var e2stops =
      !protect && e2.NextInLML === null && e2.Top.X == pt.X && e2.Top.Y == pt.Y;
    var e1Contributing = e1.OutIdx >= 0;
    var e2Contributing = e2.OutIdx >= 0;

    //if either edge is on an OPEN path ...
    if (e1.WindDelta === 0 || e2.WindDelta === 0) {
      //ignore subject-subject open path intersections UNLESS they
      //are both open paths, AND they are both 'contributing maximas' ...
      if (e1.WindDelta === 0 && e2.WindDelta === 0) {
        if ((e1stops || e2stops) && e1Contributing && e2Contributing)
          this._outPolygon.addLocalMaxPoly(e1, e2, pt, this._activeEdges);
      }
      //if intersecting a subj line with a subj poly ...
      else if (
        e1.PolyTyp == e2.PolyTyp &&
        e1.WindDelta != e2.WindDelta &&
        this._clipType == ClipType.Union
      ) {
        if (e1.WindDelta === 0) {
          if (e2Contributing) {
            this._outPolygon.addOutPt(e1, pt);
            if (e1Contributing) e1.OutIdx = -1;
          }
        } else {
          if (e1Contributing) {
            this._outPolygon.addOutPt(e2, pt);
            if (e2Contributing) e2.OutIdx = -1;
          }
        }
      } else if (e1.PolyTyp != e2.PolyTyp) {
        if (
          e1.WindDelta === 0 &&
          Math.abs(e2.WindCnt) == 1 &&
          (this._clipType != ClipType.Union || e2.WindCnt2 === 0)
        ) {
          this._outPolygon.addOutPt(e1, pt);
          if (e1Contributing) e1.OutIdx = -1;
        } else if (
          e2.WindDelta === 0 &&
          Math.abs(e1.WindCnt) == 1 &&
          (this._clipType != ClipType.Union || e1.WindCnt2 === 0)
        ) {
          this._outPolygon.addOutPt(e2, pt);
          if (e2Contributing) e2.OutIdx = -1;
        }
      }
      if (e1stops)
        if (e1.OutIdx < 0) this._deleteFromAEL(e1);
        else console.error("Error intersecting polylines");
      if (e2stops)
        if (e2.OutIdx < 0) this._deleteFromAEL(e2);
        else console.error("Error intersecting polylines");
      return;
    }

    //update winding counts...
    //assumes that e1 will be to the Right of e2 ABOVE the intersection
    if (e1.PolyTyp == e2.PolyTyp) {
      if (this.IsEvenOddFillType(e1)) {
        var oldE1WindCnt = e1.WindCnt;
        e1.WindCnt = e2.WindCnt;
        e2.WindCnt = oldE1WindCnt;
      } else {
        if (e1.WindCnt + e2.WindDelta === 0) e1.WindCnt = -e1.WindCnt;
        else e1.WindCnt += e2.WindDelta;
        if (e2.WindCnt - e1.WindDelta === 0) e2.WindCnt = -e2.WindCnt;
        else e2.WindCnt -= e1.WindDelta;
      }
    } else {
      if (!this.IsEvenOddFillType(e2)) e1.WindCnt2 += e2.WindDelta;
      else e1.WindCnt2 = e1.WindCnt2 === 0 ? 1 : 0;
      if (!this.IsEvenOddFillType(e1)) e2.WindCnt2 -= e1.WindDelta;
      else e2.WindCnt2 = e2.WindCnt2 === 0 ? 1 : 0;
    }
    var e1FillType, e2FillType, e1FillType2, e2FillType2;
    if (e1.PolyTyp == PolyType.Subject) {
      e1FillType = this._subjFillType;
      e1FillType2 = this._clipFillType;
    } else {
      e1FillType = this._clipFillType;
      e1FillType2 = this._subjFillType;
    }
    if (e2.PolyTyp == PolyType.Subject) {
      e2FillType = this._subjFillType;
      e2FillType2 = this._clipFillType;
    } else {
      e2FillType = this._clipFillType;
      e2FillType2 = this._subjFillType;
    }
    var e1Wc, e2Wc;
    switch (e1FillType) {
      case PolyFillType.Positive:
        e1Wc = e1.WindCnt;
        break;
      case PolyFillType.Negative:
        e1Wc = -e1.WindCnt;
        break;
      default:
        e1Wc = Math.abs(e1.WindCnt);
        break;
    }
    switch (e2FillType) {
      case PolyFillType.Positive:
        e2Wc = e2.WindCnt;
        break;
      case PolyFillType.Negative:
        e2Wc = -e2.WindCnt;
        break;
      default:
        e2Wc = Math.abs(e2.WindCnt);
        break;
    }
    if (e1Contributing && e2Contributing) {
      if (
        e1stops ||
        e2stops ||
        (e1Wc !== 0 && e1Wc != 1) ||
        (e2Wc !== 0 && e2Wc != 1) ||
        (e1.PolyTyp != e2.PolyTyp && this._clipType != ClipType.Xor)
      )
        this._outPolygon.addLocalMaxPoly(e1, e2, pt, this._activeEdges);
      else {
        this._outPolygon.addOutPt(e1, pt);
        this._outPolygon.addOutPt(e2, pt);
        e1.swapSides(e2);
        e1.swapPolyIndices(e2);
      }
    } else if (e1Contributing) {
      if (e2Wc === 0 || e2Wc == 1) {
        this._outPolygon.addOutPt(e1, pt);
        e1.swapSides(e2);
        e1.swapPolyIndices(e2);
      }
    } else if (e2Contributing) {
      if (e1Wc === 0 || e1Wc == 1) {
        this._outPolygon.addOutPt(e2, pt);
        e1.swapSides(e2);
        e1.swapPolyIndices(e2);
      }
    } else if (
      (e1Wc === 0 || e1Wc == 1) &&
      (e2Wc === 0 || e2Wc == 1) &&
      !e1stops &&
      !e2stops
    ) {
      //neither edge is currently contributing ...
      var e1Wc2, e2Wc2;
      switch (e1FillType2) {
        case PolyFillType.Positive:
          e1Wc2 = e1.WindCnt2;
          break;
        case PolyFillType.Negative:
          e1Wc2 = -e1.WindCnt2;
          break;
        default:
          e1Wc2 = Math.abs(e1.WindCnt2);
          break;
      }
      switch (e2FillType2) {
        case PolyFillType.Positive:
          e2Wc2 = e2.WindCnt2;
          break;
        case PolyFillType.Negative:
          e2Wc2 = -e2.WindCnt2;
          break;
        default:
          e2Wc2 = Math.abs(e2.WindCnt2);
          break;
      }
      if (e1.PolyTyp != e2.PolyTyp) this.AddLocalMinPoly(e1, e2, pt);
      else if (e1Wc == 1 && e2Wc == 1)
        switch (this._clipType) {
          case ClipType.Intersection:
            if (e1Wc2 > 0 && e2Wc2 > 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipType.Union:
            if (e1Wc2 <= 0 && e2Wc2 <= 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipType.Difference:
            if (
              (e1.PolyTyp == PolyType.Clip && e1Wc2 > 0 && e2Wc2 > 0) ||
              (e1.PolyTyp == PolyType.Subject && e1Wc2 <= 0 && e2Wc2 <= 0)
            )
              this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipType.Xor:
            this.AddLocalMinPoly(e1, e2, pt);
            break;
        }
      else e1.swapSides(e2);
    }
    if (
      e1stops != e2stops &&
      ((e1stops && e1.OutIdx >= 0) || (e2stops && e2.OutIdx >= 0))
    ) {
      e1.swapSides(e2);
      e1.swapPolyIndices(e2);
    }
    //finally, delete any non-contributing maxima edges  ...
    if (e1stops) this._deleteFromAEL(e1);
    if (e2stops) this._deleteFromAEL(e2);
  }

  public DoMaxima(e: TEdge): void {
    var eMaxPair = e.getMaximaPair();
    if (eMaxPair === null) {
      if (e.OutIdx >= 0) this._outPolygon.addOutPt(e, e.Top);
      this._deleteFromAEL(e);
      return;
    }
    var eNext = e.NextInAEL;
    var use_lines = true;
    while (eNext !== null && eNext != eMaxPair) {
      this.IntersectEdges(e, eNext, e.Top, true);
      this.SwapPositionsInAEL(e, eNext);
      eNext = e.NextInAEL;
    }
    if (e.OutIdx == -1 && eMaxPair.OutIdx == -1) {
      this._deleteFromAEL(e);
      this._deleteFromAEL(eMaxPair);
    } else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0) {
      this.IntersectEdges(e, eMaxPair, e.Top, false);
    } else if (use_lines && e.WindDelta === 0) {
      if (e.OutIdx >= 0) {
        this._outPolygon.addOutPt(e, e.Top);
        e.OutIdx = -1;
      }
      this._deleteFromAEL(e);
      if (eMaxPair.OutIdx >= 0) {
        this._outPolygon.addOutPt(eMaxPair, e.Top);
        eMaxPair.OutIdx = -1;
      }
      this._deleteFromAEL(eMaxPair);
    } else console.error("DoMaxima error");
  }

  private _addJoin(Op1: OutPt, Op2: OutPt, OffPt: IntPoint) {
    this._joins.push(new Join(Op1, Op2, OffPt));
  }

  public ProcessEdgesAtTopOfScanbeam(topY: number) {
    var e = this._activeEdges;
    while (e !== null) {
      //1. process maxima, treating them as if they're 'bent' horizontal edges,
      //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
      var IsMaximaEdge = e.isMaxima(topY);

      if (IsMaximaEdge) {
        var eMaxPair = e.getMaximaPair();
        IsMaximaEdge = eMaxPair === null || !eMaxPair.isHorizontal;
      }
      if (IsMaximaEdge) {
        var ePrev = e.PrevInAEL;
        this.DoMaxima(e);
        if (ePrev === null) e = this._activeEdges;
        else e = ePrev.NextInAEL;
      } else {
        //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
        if (e.isIntermediate(topY) && e.NextInLML.isHorizontal) {
          e = this.UpdateEdgeIntoAEL(e);
          if (e.OutIdx >= 0) {
            this._outPolygon.addOutPt(e, e.Bot);
          }
          this._sortedEdges = e.addEdgeToSEL(this._sortedEdges);
        } else {
          e.Curr.X = e.topX(topY);
          e.Curr.Y = topY;
        }
        if (this.strictlySimple) {
          var ePrev = e.PrevInAEL;
          if (
            e.OutIdx >= 0 &&
            e.WindDelta !== 0 &&
            ePrev !== null &&
            ePrev.OutIdx >= 0 &&
            ePrev.Curr.X == e.Curr.X &&
            ePrev.WindDelta !== 0
          ) {
            var op = this._outPolygon.addOutPt(ePrev, e.Curr);
            var op2 = this._outPolygon.addOutPt(e, e.Curr);
            this._addJoin(op, op2, e.Curr);
            //StrictlySimple (type-3) join
          }
        }
        e = e.NextInAEL;
      }
    }
    //3. Process horizontals at the Top of the scanbeam ...
    this._processHorizontals(true);
    //4. Promote intermediate vertices ...
    e = this._activeEdges;
    while (e !== null) {
      if (e.isIntermediate(topY)) {
        var op: OutPt = null;
        if (e.OutIdx >= 0) op = this._outPolygon.addOutPt(e, e.Top);
        e = this.UpdateEdgeIntoAEL(e);
        //if output polygons share an edge, they'll need joining later ...
        var ePrev = e.PrevInAEL;
        var eNext = e.NextInAEL;
        if (
          ePrev !== null &&
          ePrev.Curr.X == e.Bot.X &&
          ePrev.Curr.Y == e.Bot.Y &&
          op !== null &&
          ePrev.OutIdx >= 0 &&
          ePrev.Curr.Y > ePrev.Top.Y &&
          TEdge.slopesEqual(e, ePrev, this._useFullRange) &&
          e.WindDelta !== 0 &&
          ePrev.WindDelta !== 0
        ) {
          var op2 = this._outPolygon.addOutPt(ePrev, e.Bot);
          this._addJoin(op, op2, e.Top);
        } else if (
          eNext !== null &&
          eNext.Curr.X == e.Bot.X &&
          eNext.Curr.Y == e.Bot.Y &&
          op !== null &&
          eNext.OutIdx >= 0 &&
          eNext.Curr.Y > eNext.Top.Y &&
          TEdge.slopesEqual(e, eNext, this._useFullRange) &&
          e.WindDelta !== 0 &&
          eNext.WindDelta !== 0
        ) {
          var op2 = this._outPolygon.addOutPt(eNext, e.Bot);
          this._addJoin(op, op2, e.Top);
        }
      }
      e = e.NextInAEL;
    }
  }

  public FixupIntersectionOrder(): boolean {
    //pre-condition: intersections are sorted bottom-most first.
    //Now it's crucial that intersections are made only between adjacent edges,
    //so to ensure this the order of intersections may need adjusting ...
    this._intersections.sort(IntersectNode.compare);
    var e = this._activeEdges;
    this._sortedEdges = e;
    while (e !== null) {
      e.PrevInSEL = e.PrevInAEL;
      e.NextInSEL = e.NextInAEL;
      e = e.NextInAEL;
    }
    var cnt = this._intersections.length;
    for (var i = 0; i < cnt; i++) {
      if (!this._intersections[i].edgesAdjacent) {
        var j = i + 1;
        while (j < cnt && !this._intersections[j].edgesAdjacent) j++;
        if (j == cnt) return false;
        var tmp = this._intersections[i];
        this._intersections[i] = this._intersections[j];
        this._intersections[j] = tmp;
      }
      this._sortedEdges = this._intersections[i].swapPositionsInSEL(
        this._sortedEdges
      );
    }
    return true;
  }

  public BuildIntersectList(botY: number, topY: number): void {
    if (this._activeEdges === null) return;
    //prepare for sorting ...
    var e = this._activeEdges;
    //console.log(JSON.stringify(JSON.decycle( e )));
    this._sortedEdges = e;
    while (e !== null) {
      e.PrevInSEL = e.PrevInAEL;
      e.NextInSEL = e.NextInAEL;
      e.Curr.X = e.topX(topY);
      e = e.NextInAEL;
    }
    //bubblesort ...
    var isModified = true;
    while (isModified && this._sortedEdges !== null) {
      isModified = false;
      e = this._sortedEdges;
      while (e.NextInSEL !== null) {
        var eNext = e.NextInSEL;
        var pt = new IntPoint();
        //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
        if (e.Curr.X > eNext.Curr.X) {
          if (
            !TEdge.intersectPoint(e, eNext, pt, this._useFullRange) &&
            e.Curr.X > eNext.Curr.X + 1
          ) {
            //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
            //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
            console.error("Intersection error");
          }
          if (pt.Y > botY) {
            pt.Y = botY;
            if (Math.abs(e.Dx) > Math.abs(eNext.Dx)) pt.X = eNext.topX(botY);
            else pt.X = e.topX(botY);
          }
          var newNode = new IntersectNode(e, eNext, pt);
          this._intersections.push(newNode);
          this._sortedEdges = newNode.swapPositionsInSEL(this._sortedEdges);
          isModified = true;
        } else e = eNext;
      }
      if (e.PrevInSEL !== null) e.PrevInSEL.NextInSEL = null;
      else break;
    }
    this._sortedEdges = null;
  }

  public ProcessIntersectList() {
    for (var i = 0, ilen = this._intersections.length; i < ilen; i++) {
      var iNode = this._intersections[i];
      this.IntersectEdges(iNode.Edge1, iNode.Edge2, iNode.Pt, true);
      this.SwapPositionsInAEL(iNode.Edge1, iNode.Edge2);
    }
    this._intersections.length = 0;
  }

  public ProcessIntersections(botY: number, topY: number): boolean {
    if (this._activeEdges == null) return true;
    try {
      this.BuildIntersectList(botY, topY);
      if (this._intersections.length == 0) return true;
      if (this._intersections.length == 1 || this.FixupIntersectionOrder())
        this.ProcessIntersectList();
      else return false;
    } catch ($$e2) {
      this._sortedEdges = null;
      this._intersections.length = 0;
      console.error("ProcessIntersections error");
    }
    this._sortedEdges = null;
    return true;
  }

  public PopLocalMinima() {
    if (this._CurrentLM === null) return;
    this._CurrentLM = this._CurrentLM.Next;
  }

  public InsertEdgeIntoAEL(edge: TEdge, startEdge: TEdge): void {
    if (this._activeEdges === null) {
      edge.PrevInAEL = null;
      edge.NextInAEL = null;
      this._activeEdges = edge;
    } else if (
      startEdge === null &&
      TEdge.e2InsertsBeforeE1(this._activeEdges, edge)
    ) {
      edge.PrevInAEL = null;
      edge.NextInAEL = this._activeEdges;
      this._activeEdges.PrevInAEL = edge;
      this._activeEdges = edge;
    } else {
      if (startEdge === null) startEdge = this._activeEdges;
      while (
        startEdge.NextInAEL !== null &&
        !TEdge.e2InsertsBeforeE1(startEdge.NextInAEL, edge)
      )
        startEdge = startEdge.NextInAEL;
      edge.NextInAEL = startEdge.NextInAEL;
      if (startEdge.NextInAEL !== null) startEdge.NextInAEL.PrevInAEL = edge;
      edge.PrevInAEL = startEdge;
      startEdge.NextInAEL = edge;
    }
  }

  public IsEvenOddFillType(edge: TEdge): boolean {
    if (edge.PolyTyp == PolyType.Subject)
      return this._subjFillType == PolyFillType.EvenOdd;
    else return this._clipFillType == PolyFillType.EvenOdd;
  }

  public IsEvenOddAltFillType(edge: TEdge): boolean {
    if (edge.PolyTyp == PolyType.Subject)
      return this._clipFillType == PolyFillType.EvenOdd;
    else return this._subjFillType == PolyFillType.EvenOdd;
  }

  public SetWindingCount(edge: TEdge): void {
    var e = edge.PrevInAEL;
    //find the edge of the same polytype that immediately preceeds 'edge' in AEL
    while (e !== null && (e.PolyTyp != edge.PolyTyp || e.WindDelta === 0))
      e = e.PrevInAEL;
    if (e === null) {
      edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
      edge.WindCnt2 = 0;
      e = this._activeEdges;
      //ie get ready to calc WindCnt2
    } else if (edge.WindDelta === 0 && this._clipType != ClipType.Union) {
      edge.WindCnt = 1;
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL;
      //ie get ready to calc WindCnt2
    } else if (this.IsEvenOddFillType(edge)) {
      //EvenOdd filling ...
      if (edge.WindDelta === 0) {
        //are we inside a subj polygon ...
        var Inside = true;
        var e2 = e.PrevInAEL;
        while (e2 !== null) {
          if (e2.PolyTyp == e.PolyTyp && e2.WindDelta !== 0) Inside = !Inside;
          e2 = e2.PrevInAEL;
        }
        edge.WindCnt = Inside ? 0 : 1;
      } else {
        edge.WindCnt = edge.WindDelta;
      }
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL;
      //ie get ready to calc WindCnt2
    } else {
      //nonZero, Positive or Negative filling ...
      if (e.WindCnt * e.WindDelta < 0) {
        //prev edge is 'decreasing' WindCount (WC) toward zero
        //so we're outside the previous polygon ...
        if (Math.abs(e.WindCnt) > 1) {
          //outside prev poly but still inside another.
          //when reversing direction of prev poly use the same WC
          if (e.WindDelta * edge.WindDelta < 0) edge.WindCnt = e.WindCnt;
          else edge.WindCnt = e.WindCnt + edge.WindDelta;
        } else edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
      } else {
        //prev edge is 'increasing' WindCount (WC) away from zero
        //so we're inside the previous polygon ...
        if (edge.WindDelta === 0)
          edge.WindCnt = e.WindCnt < 0 ? e.WindCnt - 1 : e.WindCnt + 1;
        else if (e.WindDelta * edge.WindDelta < 0) edge.WindCnt = e.WindCnt;
        else edge.WindCnt = e.WindCnt + edge.WindDelta;
      }
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL;
      //ie get ready to calc WindCnt2
    }
    //update WindCnt2 ...
    if (this.IsEvenOddAltFillType(edge)) {
      //EvenOdd filling ...
      while (e != edge) {
        if (e.WindDelta !== 0) edge.WindCnt2 = edge.WindCnt2 === 0 ? 1 : 0;
        e = e.NextInAEL;
      }
    } else {
      //nonZero, Positive or Negative filling ...
      while (e != edge) {
        edge.WindCnt2 += e.WindDelta;
        e = e.NextInAEL;
      }
    }
  }

  public AddLocalMinPoly(e1: TEdge, e2: TEdge, pt: IntPoint) {
    var result;
    var e, prevE;
    if (e2.isHorizontal || e1.Dx > e2.Dx) {
      result = this._outPolygon.addOutPt(e1, pt);
      e2.OutIdx = e1.OutIdx;
      e1.Side = EdgeSide.Left;
      e2.Side = EdgeSide.Right;
      e = e1;
      if (e.PrevInAEL == e2) prevE = e2.PrevInAEL;
      else prevE = e.PrevInAEL;
    } else {
      result = this._outPolygon.addOutPt(e2, pt);
      e1.OutIdx = e2.OutIdx;
      e1.Side = EdgeSide.Right;
      e2.Side = EdgeSide.Left;
      e = e2;
      if (e.PrevInAEL == e1) prevE = e1.PrevInAEL;
      else prevE = e.PrevInAEL;
    }
    if (
      prevE !== null &&
      prevE.OutIdx >= 0 &&
      prevE.topX(pt.Y) == e.topX(pt.Y) &&
      TEdge.slopesEqual(e, prevE, this._useFullRange) &&
      e.WindDelta !== 0 &&
      prevE.WindDelta !== 0
    ) {
      var outPt = this._outPolygon.addOutPt(prevE, pt);
      this._addJoin(result, outPt, e.Top);
    }
    return result;
  }

  public InsertLocalMinimaIntoAEL(botY: number) {
    while (this._CurrentLM !== null && this._CurrentLM.Y == botY) {
      var lb = this._CurrentLM.LeftBound;
      var rb = this._CurrentLM.RightBound;
      this.PopLocalMinima();
      var Op1 = null;
      if (lb === null) {
        this.InsertEdgeIntoAEL(rb, null);
        this.SetWindingCount(rb);
        if (
          rb.isContributing(
            this._clipType,
            this._subjFillType,
            this._clipFillType
          )
        )
          Op1 = this._outPolygon.addOutPt(rb, rb.Bot);
      } else if (rb == null) {
        this.InsertEdgeIntoAEL(lb, null);
        this.SetWindingCount(lb);
        if (
          lb.isContributing(
            this._clipType,
            this._subjFillType,
            this._clipFillType
          )
        )
          Op1 = this._outPolygon.addOutPt(lb, lb.Bot);
        this._scanbeam = Scanbeam.insert(this._scanbeam, lb.Top.Y);
      } else {
        this.InsertEdgeIntoAEL(lb, null);
        this.InsertEdgeIntoAEL(rb, lb);
        this.SetWindingCount(lb);
        rb.WindCnt = lb.WindCnt;
        rb.WindCnt2 = lb.WindCnt2;
        if (
          lb.isContributing(
            this._clipType,
            this._subjFillType,
            this._clipFillType
          )
        )
          Op1 = this.AddLocalMinPoly(lb, rb, lb.Bot);
        this._scanbeam = Scanbeam.insert(this._scanbeam, lb.Top.Y);
      }
      if (rb != null) {
        if (rb.isHorizontal) {
          this._sortedEdges = rb.addEdgeToSEL(this._sortedEdges);
        } else this._scanbeam = Scanbeam.insert(this._scanbeam, rb.Top.Y);
      }
      if (lb == null || rb == null) continue;
      //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
      const joins = this._ghostJoinStore.export(Op1, rb);

      if (joins.length !== 0) {
        this._joins = this._joins.concat(joins);
      }

      if (
        lb.OutIdx >= 0 &&
        lb.PrevInAEL !== null &&
        lb.PrevInAEL.Curr.X == lb.Bot.X &&
        lb.PrevInAEL.OutIdx >= 0 &&
        TEdge.slopesEqual(lb.PrevInAEL, lb, this._useFullRange) &&
        lb.WindDelta !== 0 &&
        lb.PrevInAEL.WindDelta !== 0
      ) {
        var Op2 = this._outPolygon.addOutPt(lb.PrevInAEL, lb.Bot);
        this._addJoin(Op1, Op2, lb.Top);
      }
      if (lb.NextInAEL != rb) {
        if (
          rb.OutIdx >= 0 &&
          rb.PrevInAEL.OutIdx >= 0 &&
          TEdge.slopesEqual(rb.PrevInAEL, rb, this._useFullRange) &&
          rb.WindDelta !== 0 &&
          rb.PrevInAEL.WindDelta !== 0
        ) {
          var Op2 = this._outPolygon.addOutPt(rb.PrevInAEL, rb.Bot);
          this._addJoin(Op1, Op2, rb.Top);
        }
        var e = lb.NextInAEL;
        if (e !== null)
          while (e != rb) {
            //nb: For calculating winding counts etc, IntersectEdges() assumes
            //that param1 will be to the right of param2 ABOVE the intersection ...
            this.IntersectEdges(rb, e, lb.Curr, false);
            //order important here
            e = e.NextInAEL;
          }
      }
    }
  }

  private _execute(): boolean {
    try {
      this._reset();
      if (this._CurrentLM === null) return false;
      var botY = this.PopScanbeam();
      do {
        this.InsertLocalMinimaIntoAEL(botY);
        this._ghostJoinStore.clean();
        this._processHorizontals(false);
        if (this._scanbeam === null) break;
        var topY = this.PopScanbeam();
        //console.log("botY:" + botY + ", topY:" + topY);
        if (!this.ProcessIntersections(botY, topY)) return false;
        this.ProcessEdgesAtTopOfScanbeam(topY);
        botY = topY;
      } while (this._scanbeam !== null || this._CurrentLM !== null);
      //fix orientations ...
      this._outPolygon.fixOrientations(
        this._joins,
        this.reverseSolution,
        this._useFullRange,
        this.strictlySimple
      );
      return true;
    } finally {
      Clipper.Clear(this._joins);
      this._ghostJoinStore.clean();
    }
  }

  private _processHorizontals(isTopOfScanbeam: boolean): void {
    var horzEdge = this._sortedEdges;
    while (horzEdge !== null) {
      this._deleteFromSEL(horzEdge);
      this._processHorizontal(horzEdge, isTopOfScanbeam);
      horzEdge = this._sortedEdges;
    }
  }

  private _deleteFromSEL(e: TEdge): void {
    this._sortedEdges = e.deleteFromSEL(this._sortedEdges);
  }

  public PopScanbeam(): number {
    var Y = this._scanbeam.Y;
    this._scanbeam = this._scanbeam.Next;
    return Y;
  }

  private _reset(): void {
    this._CurrentLM = this._MinimaList;
    if (this._CurrentLM == null) return;
    //ie nothing to process
    //reset all edges ...
    var lm = this._MinimaList;
    while (lm != null) {
      var e = lm.LeftBound;
      if (e != null) {
        //e.Curr = e.Bot;
        e.Curr.X = e.Bot.X;
        e.Curr.Y = e.Bot.Y;
        e.Side = EdgeSide.Left;
        e.OutIdx = Clipper.Unassigned;
      }
      e = lm.RightBound;
      if (e != null) {
        //e.Curr = e.Bot;
        e.Curr.X = e.Bot.X;
        e.Curr.Y = e.Bot.Y;
        e.Side = EdgeSide.Right;
        e.OutIdx = Clipper.Unassigned;
      }
      lm = lm.Next;
    }

    this._scanbeam = null;
    this._activeEdges = null;
    this._sortedEdges = null;

    var lm = this._MinimaList;
    while (lm !== null) {
      this._scanbeam = Scanbeam.insert(this._scanbeam, lm.Y);
      lm = lm.Next;
    }
  }

  public UpdateEdgeIntoAEL(e: TEdge): TEdge {
    if (e.NextInLML === null) console.error("UpdateEdgeIntoAEL: invalid call");
    var AelPrev = e.PrevInAEL;
    var AelNext = e.NextInAEL;
    e.NextInLML.OutIdx = e.OutIdx;
    if (AelPrev !== null) AelPrev.NextInAEL = e.NextInLML;
    else this._activeEdges = e.NextInLML;
    if (AelNext !== null) AelNext.PrevInAEL = e.NextInLML;
    e.NextInLML.Side = e.Side;
    e.NextInLML.WindDelta = e.WindDelta;
    e.NextInLML.WindCnt = e.WindCnt;
    e.NextInLML.WindCnt2 = e.WindCnt2;
    e = e.NextInLML;
    //    e.Curr = e.Bot;
    e.Curr.X = e.Bot.X;
    e.Curr.Y = e.Bot.Y;
    e.PrevInAEL = AelPrev;
    e.NextInAEL = AelNext;

    if (!e.isHorizontal) {
      this._scanbeam = Scanbeam.insert(this._scanbeam, e.Top.Y);
    }
    return e;
  }

  private _processHorizontal(horzEdge: TEdge, isTopOfScanbeam: boolean) {
    var $var: DirData = { Dir: null, Left: null, Right: null };
    this.GetHorzDirection(horzEdge, $var);
    var dir = $var.Dir;
    var horzLeft = $var.Left;
    var horzRight = $var.Right;

    var eLastHorz = horzEdge,
      eMaxPair = null;
    while (eLastHorz.NextInLML !== null && eLastHorz.NextInLML.isHorizontal)
      eLastHorz = eLastHorz.NextInLML;
    if (eLastHorz.NextInLML === null) eMaxPair = eLastHorz.getMaximaPair();
    for (;;) {
      var IsLastHorz = horzEdge == eLastHorz;
      var e = horzEdge.getNextInAEL(dir);
      while (e !== null) {
        //Break if we've got to the end of an intermediate horizontal edge ...
        //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
        if (
          e.Curr.X == horzEdge.Top.X &&
          horzEdge.NextInLML !== null &&
          e.Dx < horzEdge.NextInLML.Dx
        )
          break;
        var eNext = e.getNextInAEL(dir);
        //saves eNext for later
        if (
          (dir == Direction.LeftToRight && e.Curr.X <= horzRight) ||
          (dir == Direction.RightToLeft && e.Curr.X >= horzLeft)
        ) {
          this._ghostJoinStore.add(this._outPolygon, horzEdge, isTopOfScanbeam);

          //so far we're still in range of the horizontal Edge  but make sure
          //we're at the last of consec. horizontals when matching with eMaxPair
          if (e == eMaxPair && IsLastHorz) {
            if (dir == Direction.LeftToRight)
              this.IntersectEdges(horzEdge, e, e.Top, false);
            else this.IntersectEdges(e, horzEdge, e.Top, false);
            if (eMaxPair.OutIdx >= 0) console.error("ProcessHorizontal error");
            return;
          } else if (dir == Direction.LeftToRight) {
            var Pt = new IntPoint(e.Curr.X, horzEdge.Curr.Y);
            this.IntersectEdges(horzEdge, e, Pt, true);
          } else {
            var Pt = new IntPoint(e.Curr.X, horzEdge.Curr.Y);
            this.IntersectEdges(e, horzEdge, Pt, true);
          }
          this.SwapPositionsInAEL(horzEdge, e);
        } else if (
          (dir == Direction.LeftToRight && e.Curr.X >= horzRight) ||
          (dir == Direction.RightToLeft && e.Curr.X <= horzLeft)
        )
          break;
        e = eNext;
      }
      //end while
      this._ghostJoinStore.add(this._outPolygon, horzEdge, isTopOfScanbeam);

      if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
        horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
        if (horzEdge.OutIdx >= 0)
          this._outPolygon.addOutPt(horzEdge, horzEdge.Bot);

        var $var = { Dir: dir, Left: horzLeft, Right: horzRight };
        this.GetHorzDirection(horzEdge, $var);
        dir = $var.Dir;
        horzLeft = $var.Left;
        horzRight = $var.Right;
      } else break;
    }
    //end for (;;)
    if (horzEdge.NextInLML !== null) {
      if (horzEdge.OutIdx >= 0) {
        var op1 = this._outPolygon.addOutPt(horzEdge, horzEdge.Top);
        horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
        if (horzEdge.WindDelta === 0) return;
        //nb: HorzEdge is no longer horizontal here
        var ePrev = horzEdge.PrevInAEL;
        var eNext = horzEdge.NextInAEL;
        if (
          ePrev !== null &&
          ePrev.Curr.X == horzEdge.Bot.X &&
          ePrev.Curr.Y == horzEdge.Bot.Y &&
          ePrev.WindDelta !== 0 &&
          ePrev.OutIdx >= 0 &&
          ePrev.Curr.Y > ePrev.Top.Y &&
          TEdge.slopesEqual(horzEdge, ePrev, this._useFullRange)
        ) {
          var op2 = this._outPolygon.addOutPt(ePrev, horzEdge.Bot);
          this._addJoin(op1, op2, horzEdge.Top);
        } else if (
          eNext !== null &&
          eNext.Curr.X == horzEdge.Bot.X &&
          eNext.Curr.Y == horzEdge.Bot.Y &&
          eNext.WindDelta !== 0 &&
          eNext.OutIdx >= 0 &&
          eNext.Curr.Y > eNext.Top.Y &&
          TEdge.slopesEqual(horzEdge, eNext, this._useFullRange)
        ) {
          var op2 = this._outPolygon.addOutPt(eNext, horzEdge.Bot);
          this._addJoin(op1, op2, horzEdge.Top);
        }
      } else horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
    } else if (eMaxPair !== null) {
      if (eMaxPair.OutIdx >= 0) {
        if (dir == Direction.LeftToRight)
          this.IntersectEdges(horzEdge, eMaxPair, horzEdge.Top, false);
        else this.IntersectEdges(eMaxPair, horzEdge, horzEdge.Top, false);
        if (eMaxPair.OutIdx >= 0) console.error("ProcessHorizontal error");
      } else {
        this._deleteFromAEL(horzEdge);
        this._deleteFromAEL(eMaxPair);
      }
    } else {
      if (horzEdge.OutIdx >= 0)
        this._outPolygon.addOutPt(horzEdge, horzEdge.Top);
      this._deleteFromAEL(horzEdge);
    }
  }

  public GetHorzDirection(HorzEdge: TEdge, $var: DirData): void {
    if (HorzEdge.Bot.X < HorzEdge.Top.X) {
      $var.Left = HorzEdge.Bot.X;
      $var.Right = HorzEdge.Top.X;
      $var.Dir = Direction.LeftToRight;
    } else {
      $var.Left = HorzEdge.Top.X;
      $var.Right = HorzEdge.Bot.X;
      $var.Dir = Direction.RightToLeft;
    }
  }

  private _deleteFromAEL(e: TEdge): void {
    this._activeEdges = e.deleteFromAEL(this._activeEdges);
  }

  public static Clear(a: any[]) {
    a.length = 0;
  }

  public static CleanPolygon(
    path: IntPoint[],
    distance: number = 1.415
  ): IntPoint[] {
    //distance = proximity in units/pixels below which vertices will be stripped.
    //Default ~= sqrt(2) so when adjacent vertices or semi-adjacent vertices have
    //both x & y coords within 1 unit, then the second vertex will be stripped.
    var cnt = path.length;
    if (cnt == 0) return [];
    var outPts: OutPt[] = new Array(cnt);
    for (var i = 0; i < cnt; ++i) outPts[i] = new OutPt();
    for (var i = 0; i < cnt; ++i) {
      outPts[i].Pt = path[i];
      outPts[i].Next = outPts[(i + 1) % cnt];
      outPts[i].Next.Prev = outPts[i];
      outPts[i].Idx = 0;
    }
    var distSqrd = distance * distance;
    var op = outPts[0];
    while (op.Idx == 0 && op.Next != op.Prev) {
      if (IntPoint.pointsAreClose(op.Pt, op.Prev.Pt, distSqrd)) {
        op = op.exclude();
        cnt--;
      } else if (IntPoint.pointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd)) {
        op.Next.exclude();
        op = op.exclude();
        cnt -= 2;
      } else if (op.Pt.slopesNearCollinear(op.Prev.Pt, op.Next.Pt, distSqrd)) {
        op = op.exclude();
        cnt--;
      } else {
        op.Idx = 1;
        op = op.Next;
      }
    }
    if (cnt < 3) cnt = 0;
    var result = new Array(cnt);
    for (var i = 0; i < cnt; ++i) {
      result[i] = new IntPoint(op.Pt.X, op.Pt.Y);
      op = op.Next;
    }
    outPts = null;
    return result;
  }

  public static Area(poly: IntPoint[]): number {
    var cnt = poly.length;
    if (cnt < 3) return 0;
    var a = 0;
    for (var i = 0, j = cnt - 1; i < cnt; ++i) {
      a += (poly[j].X + poly[i].X) * (poly[j].Y - poly[i].Y);
      j = i;
    }
    return -a * 0.5;
  }

  public static SimplifyPolygon(
    poly: IntPoint[],
    fillType: PolyFillType
  ): IntPoint[][] {
    var result: IntPoint[][] = [];
    var c = new Clipper();
    c.strictlySimple = true;
    c.addPath(poly, PolyType.Subject, true);
    c.execute(ClipType.Union, result, fillType, fillType);
    return result;
  }

  public static CleanPolygons(
    polys: IntPoint[][],
    distance: number
  ): IntPoint[][] {
    var result = new Array(polys.length);
    for (var i = 0, ilen = polys.length; i < ilen; i++)
      result[i] = Clipper.CleanPolygon(polys[i], distance);
    return result;
  }

  public static near_zero(val: number) {
    return Math.abs(val) < Clipper.tolerance;
  }

  private static _getPolygonLastIndex(
    polygon: IntPoint[],
    isClosed: boolean
  ): number {
    let result: number = polygon.length - 1;

    if (isClosed) {
      while (result > 0 && polygon[0].equal(polygon[result])) {
        --result;
      }
    }

    while (result > 0 && polygon[result].equal(polygon[result - 1])) {
      --result;
    }

    return result;
  }

  static tolerance: number = 1e-20;
  static Unassigned: number = -1;
  static horizontal: number = -9007199254740992;
  static Skip: number = -2;
}
