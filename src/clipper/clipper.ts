import { ClipType, EdgeSide, PolyFillType, PolyType } from "./enums";
import JoinStore from "./join-store";
import IntPoint from "./int-point";
import LocalMinima from "./local-minima";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import { TEdge } from "./edge";
import IntersectStore from "./intersect-store";
import ScanbeamStore from "./scanbeam-store";

export default class Clipper {
  private _MinimaList: LocalMinima = null;
  private _CurrentLM: LocalMinima = null;
  private _useFullRange: boolean = false;
  private _hasOpenPaths: boolean = false;
  private _preserveCollinear: boolean = false;
  private _executeLocked: boolean = false;
  public reverseSolution: boolean = false;
  public strictlySimple: boolean = false;
  private _outPolygon: OutPolygon;
  private _joinStore: JoinStore;
  private _intersectStore: IntersectStore;
  private _scanbeamStore: ScanbeamStore;

  constructor() {
    this._outPolygon = new OutPolygon();
    this._joinStore = new JoinStore();
    this._scanbeamStore = new ScanbeamStore();
    this._intersectStore = new IntersectStore(
      this._outPolygon,
      this._joinStore,
      this._scanbeamStore
    );
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
      return true;
    }

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
    solution.length = 0;
    this._intersectStore.initTypes(clipType, clipFillType, subjFillType);

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

  public PopLocalMinima() {
    if (this._CurrentLM === null) return;
    this._CurrentLM = this._CurrentLM.Next;
  }

  private _insertLocalMinimaIntoAEL(botY: number) {
    while (this._CurrentLM !== null && this._CurrentLM.Y == botY) {
      var lb = this._CurrentLM.LeftBound;
      var rb = this._CurrentLM.RightBound;
      this.PopLocalMinima();

      this._intersectStore.insertLocalMinimaIntoAEL(lb, rb, this._useFullRange);
    }
  }

  private _execute(): boolean {
    try {
      this._reset();
      if (this._CurrentLM === null) return false;
      var botY = this._scanbeamStore.pop();
      do {
        this._insertLocalMinimaIntoAEL(botY);
        this._joinStore.clean(false);
        this._intersectStore.processHorizontals(false, this._useFullRange);
        if (this._scanbeamStore.isEmpty) break;
        var topY = this._scanbeamStore.pop();
        //console.log("botY:" + botY + ", topY:" + topY);
        if (
          !this._intersectStore.processIntersections(
            botY,
            topY,
            this._useFullRange
          )
        )
          return false;
        this._intersectStore.processEdgesAtTopOfScanbeam(
          topY,
          this._useFullRange,
          this.strictlySimple
        );
        botY = topY;
      } while (!this._scanbeamStore.isEmpty || this._CurrentLM !== null);
      //fix orientations ...
      this._outPolygon.fixOrientations(
        this._joinStore.joins,
        this.reverseSolution,
        this._useFullRange,
        this.strictlySimple
      );
      return true;
    } finally {
      this._joinStore.clean(true);
    }
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

    this._intersectStore.clean();
    this._scanbeamStore.clean();

    var lm = this._MinimaList;
    while (lm !== null) {
      this._scanbeamStore.insert(lm.Y);
      lm = lm.Next;
    }
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
