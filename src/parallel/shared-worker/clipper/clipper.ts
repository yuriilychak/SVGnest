import {
  ClipType,
  Direction,
  EdgeSide,
  PolyFillType,
  PolyType
} from "../enums";
import Int128 from "./int-128";
import IntPoint from "./int-point";
import IntRect from "./int-rect";
import IntersectNode from "./intersect-node";
import Join from "./join";
import LocalMinima from "./local-minima";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";

interface DirData {
  Left: number | null;
  Right: number | null;
  Dir: Direction | null;
}

export default class Clipper {
  private m_MinimaList: LocalMinima = null;
  private m_CurrentLM: any = null;
  private m_edges: any[] = [];
  private m_UseFullRange: boolean = false;
  private m_HasOpenPaths: boolean = false;
  private PreserveCollinear: boolean = false;
  private m_ClipType: ClipType = ClipType.ctIntersection;
  private m_Scanbeam: Scanbeam = null;
  private m_ActiveEdges: TEdge = null;
  private m_SortedEdges: TEdge = null;
  private m_ExecuteLocked: boolean = false;
  private m_ClipFillType: PolyFillType = PolyFillType.pftEvenOdd;
  private m_SubjFillType: PolyFillType = PolyFillType.pftEvenOdd;
  public ReverseSolution: boolean = false;
  private StrictlySimple: boolean = false;
  private m_IntersectList: IntersectNode[] = [];
  private m_UsingPolyTree: boolean = false;
  private m_PolyOuts: OutRec[] = [];
  private m_Joins: Join[] = [];
  private m_GhostJoins: Join[] = [];

  constructor(InitOptions: number = 0) {
    this.ReverseSolution = (1 & InitOptions) !== 0;
    this.StrictlySimple = (2 & InitOptions) !== 0;
    this.PreserveCollinear = (4 & InitOptions) !== 0;
  }

  public AddPaths(
    ppg: IntPoint[][],
    polyType: PolyType,
    closed: boolean
  ): boolean {
    let result: boolean = false;
    const polygonCount: number = ppg.length;
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
      if (this.AddPath(ppg[i], polyType, closed)) {
        result = true;
      }
    }
    return result;
  }

  public AddPath(
    pg: IntPoint[],
    polyType: PolyType,
    isClosed: boolean
  ): boolean {
    if (!isClosed && polyType == PolyType.ptClip)
      console.error("AddPath: Open paths must be subject.");

    var highI = pg.length - 1;
    if (isClosed)
      while (highI > 0 && IntPoint.op_Equality(pg[highI], pg[0])) --highI;
    while (highI > 0 && IntPoint.op_Equality(pg[highI], pg[highI - 1])) --highI;
    if ((isClosed && highI < 2) || (!isClosed && highI < 1)) return false;
    //create a new edge array ...
    var edges: TEdge[] = [];
    for (var i = 0; i <= highI; i++) edges.push(new TEdge());
    var IsFlat = true;
    //1. Basic (first) edge initialization ...

    //edges[1].Curr = pg[1];
    edges[1].Curr.X = pg[1].X;
    edges[1].Curr.Y = pg[1].Y;

    var $1 = { Value: this.m_UseFullRange };
    this.RangeTest(pg[0], $1);
    this.m_UseFullRange = $1.Value;

    $1.Value = this.m_UseFullRange;
    this.RangeTest(pg[highI], $1);
    this.m_UseFullRange = $1.Value;

    this.InitEdge(edges[0], edges[1], edges[highI], pg[0]);
    this.InitEdge(edges[highI], edges[0], edges[highI - 1], pg[highI]);
    for (var i = highI - 1; i >= 1; --i) {
      $1.Value = this.m_UseFullRange;
      this.RangeTest(pg[i], $1);
      this.m_UseFullRange = $1.Value;

      this.InitEdge(edges[i], edges[i + 1], edges[i - 1], pg[i]);
    }

    var eStart: TEdge = edges[0];
    //2. Remove duplicate vertices, and (when closed) collinear edges ...
    var E: TEdge = eStart,
      eLoopStop = eStart;
    for (;;) {
      if (IntPoint.op_Equality(E.Curr, E.Next.Curr)) {
        if (E == E.Next) break;
        if (E == eStart) eStart = E.Next;
        E = this.RemoveEdge(E);
        eLoopStop = E;
        continue;
      }
      if (E.Prev == E.Next) break;
      else if (
        isClosed &&
        Clipper.SlopesEqual(
          E.Prev.Curr,
          E.Curr,
          E.Next.Curr,
          this.m_UseFullRange
        ) &&
        (!this.PreserveCollinear ||
          !this.Pt2IsBetweenPt1AndPt3(E.Prev.Curr, E.Curr, E.Next.Curr))
      ) {
        //Collinear edges are allowed for open paths but in closed paths
        //the default is to merge adjacent collinear edges into a single edge.
        //However, if the PreserveCollinear property is enabled, only overlapping
        //collinear edges (ie spikes) will be removed from closed paths.
        if (E == eStart) eStart = E.Next;
        E = this.RemoveEdge(E);
        E = E.Prev;
        eLoopStop = E;
        continue;
      }
      E = E.Next;
      if (E == eLoopStop) break;
    }
    if ((!isClosed && E == E.Next) || (isClosed && E.Prev == E.Next))
      return false;
    if (!isClosed) {
      this.m_HasOpenPaths = true;
      eStart.Prev.OutIdx = Clipper.Skip;
    }
    //3. Do second stage of edge initialization ...
    var eHighest = eStart;
    E = eStart;
    do {
      this.InitEdge2(E, polyType);
      E = E.Next;
      if (IsFlat && E.Curr.Y != eStart.Curr.Y) IsFlat = false;
    } while (E != eStart);
    //4. Finally, add edge bounds to LocalMinima list ...
    //Totally flat paths must be handled differently when adding them
    //to LocalMinima list to avoid endless loops etc ...
    if (IsFlat) {
      if (isClosed) return false;
      E.Prev.OutIdx = Clipper.Skip;
      if (E.Prev.Bot.X < E.Prev.Top.X) this.ReverseHorizontal(E.Prev);
      var locMin: LocalMinima = new LocalMinima();
      locMin.Next = null;
      locMin.Y = E.Bot.Y;
      locMin.LeftBound = null;
      locMin.RightBound = E;
      locMin.RightBound.Side = EdgeSide.esRight;
      locMin.RightBound.WindDelta = 0;
      while (E.Next.OutIdx != Clipper.Skip) {
        E.NextInLML = E.Next;
        if (E.Bot.X != E.Prev.Top.X) this.ReverseHorizontal(E);
        E = E.Next;
      }
      this.InsertLocalMinima(locMin);
      this.m_edges.push(edges);
      return true;
    }
    this.m_edges.push(edges);
    var clockwise;
    var EMin = null;
    for (;;) {
      E = this.FindNextLocMin(E);
      if (E == EMin) break;
      else if (EMin == null) EMin = E;
      //E and E.Prev now share a local minima (left aligned if horizontal).
      //Compare their slopes to find which starts which bound ...
      var locMin = new LocalMinima();
      locMin.Next = null;
      locMin.Y = E.Bot.Y;

      if (E.Dx < E.Prev.Dx) {
        locMin.LeftBound = E.Prev;
        locMin.RightBound = E;
        clockwise = false;
        //Q.nextInLML = Q.prev
      } else {
        locMin.LeftBound = E;
        locMin.RightBound = E.Prev;
        clockwise = true;
        //Q.nextInLML = Q.next
      }
      locMin.LeftBound.Side = EdgeSide.esLeft;
      locMin.RightBound.Side = EdgeSide.esRight;
      if (!isClosed) locMin.LeftBound.WindDelta = 0;
      else if (locMin.LeftBound.Next == locMin.RightBound)
        locMin.LeftBound.WindDelta = -1;
      else locMin.LeftBound.WindDelta = 1;
      locMin.RightBound.WindDelta = -locMin.LeftBound.WindDelta;
      E = this.ProcessBound(locMin.LeftBound, clockwise);
      var E2 = this.ProcessBound(locMin.RightBound, !clockwise);
      if (locMin.LeftBound.OutIdx == Clipper.Skip) locMin.LeftBound = null;
      else if (locMin.RightBound.OutIdx == Clipper.Skip)
        locMin.RightBound = null;
      this.InsertLocalMinima(locMin);
      if (!clockwise) E = E2;
    }
    return true;
  }

  public RangeTest(Pt: IntPoint, useFullRange: { Value: boolean }): void {
    if (useFullRange.Value) {
      if (
        Pt.X > Clipper.hiRange ||
        Pt.Y > Clipper.hiRange ||
        -Pt.X > Clipper.hiRange ||
        -Pt.Y > Clipper.hiRange
      ) {
        console.error("Coordinate outside allowed range in RangeTest().");
      }
    } else if (
      Pt.X > Clipper.loRange ||
      Pt.Y > Clipper.loRange ||
      -Pt.X > Clipper.loRange ||
      -Pt.Y > Clipper.loRange
    ) {
      useFullRange.Value = true;
      this.RangeTest(Pt, useFullRange);
    }
  }

  public InitEdge(e: TEdge, eNext: TEdge, ePrev: TEdge, pt: IntPoint): void {
    e.Next = eNext;
    e.Prev = ePrev;
    //e.Curr = pt;
    e.Curr.X = pt.X;
    e.Curr.Y = pt.Y;
    e.OutIdx = -1;
  }

  public ProcessBound(edge: TEdge, isClockwise: boolean): TEdge {
    var startEdge = edge,
      result = edge;
    var Horz;
    var startX;
    if (edge.Dx == Clipper.horizontal) {
      //it's possible for adjacent overlapping horz edges to start heading left
      //before finishing right, so ...
      if (isClockwise) startX = edge.Prev.Bot.X;
      else startX = edge.Next.Bot.X;
      if (edge.Bot.X != startX) this.ReverseHorizontal(edge);
    }
    if (result.OutIdx != Clipper.Skip) {
      if (isClockwise) {
        while (
          result.Top.Y == result.Next.Bot.Y &&
          result.Next.OutIdx != Clipper.Skip
        )
          result = result.Next;
        if (
          result.Dx == Clipper.horizontal &&
          result.Next.OutIdx != Clipper.Skip
        ) {
          //nb: at the top of a bound, horizontals are added to the bound
          //only when the preceding edge attaches to the horizontal's left vertex
          //unless a Skip edge is encountered when that becomes the top divide
          Horz = result;
          while (Horz.Prev.Dx == Clipper.horizontal) Horz = Horz.Prev;
          if (Horz.Prev.Top.X == result.Next.Top.X) {
            if (!isClockwise) result = Horz.Prev;
          } else if (Horz.Prev.Top.X > result.Next.Top.X) result = Horz.Prev;
        }
        while (edge != result) {
          edge.NextInLML = edge.Next;
          if (
            edge.Dx == Clipper.horizontal &&
            edge != startEdge &&
            edge.Bot.X != edge.Prev.Top.X
          )
            this.ReverseHorizontal(edge);
          edge = edge.Next;
        }
        if (
          edge.Dx == Clipper.horizontal &&
          edge != startEdge &&
          edge.Bot.X != edge.Prev.Top.X
        )
          this.ReverseHorizontal(edge);
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
          Horz = result;
          while (Horz.Next.Dx == Clipper.horizontal) Horz = Horz.Next;
          if (Horz.Next.Top.X == result.Prev.Top.X) {
            if (!isClockwise) result = Horz.Next;
          } else if (Horz.Next.Top.X > result.Prev.Top.X) result = Horz.Next;
        }
        while (edge != result) {
          edge.NextInLML = edge.Prev;
          if (
            edge.Dx == Clipper.horizontal &&
            edge != startEdge &&
            edge.Bot.X != edge.Next.Top.X
          )
            this.ReverseHorizontal(edge);
          edge = edge.Prev;
        }
        if (
          edge.Dx == Clipper.horizontal &&
          edge != startEdge &&
          edge.Bot.X != edge.Next.Top.X
        )
          this.ReverseHorizontal(edge);
        result = result.Prev;
        //move to the edge just beyond current bound
      }
    }
    if (result.OutIdx == Clipper.Skip) {
      //if edges still remain in the current bound beyond the skip edge then
      //create another LocMin and call ProcessBound once more
      edge = result;
      if (isClockwise) {
        while (edge.Top.Y == edge.Next.Bot.Y) edge = edge.Next;
        //don't include top horizontals when parsing a bound a second time,
        //they will be contained in the opposite bound ...
        while (edge != result && edge.Dx == Clipper.horizontal)
          edge = edge.Prev;
      } else {
        while (edge.Top.Y == edge.Prev.Bot.Y) edge = edge.Prev;
        while (edge != result && edge.Dx == Clipper.horizontal)
          edge = edge.Next;
      }
      if (edge == result) {
        if (isClockwise) result = edge.Next;
        else result = edge.Prev;
      } else {
        //there are more edges in the bound beyond result starting with E
        if (isClockwise) edge = result.Next;
        else edge = result.Prev;
        var locMin: LocalMinima = new LocalMinima();
        locMin.Next = null;
        locMin.Y = edge.Bot.Y;
        locMin.LeftBound = null;
        locMin.RightBound = edge;
        locMin.RightBound.WindDelta = 0;
        result = this.ProcessBound(locMin.RightBound, isClockwise);
        this.InsertLocalMinima(locMin);
      }
    }
    return result;
  }

  public ReverseHorizontal(e: TEdge): void {
    //swap horizontal edges' top and bottom x's so they follow the natural
    //progression of the bounds - ie so their xbots will align with the
    //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
    var tmp = e.Top.X;
    e.Top.X = e.Bot.X;
    e.Bot.X = tmp;
  }

  public RemoveEdge(e: TEdge): TEdge {
    //removes e from double_linked_list (but without removing from memory)
    e.Prev.Next = e.Next;
    e.Next.Prev = e.Prev;
    e.Prev = null; //flag as removed (see ClipperBase.Clear)
    return e.Next;
  }

  public InsertLocalMinima(newLm: LocalMinima): void {
    if (this.m_MinimaList === null) {
      this.m_MinimaList = newLm;
    } else if (newLm.Y >= this.m_MinimaList.Y) {
      newLm.Next = this.m_MinimaList;
      this.m_MinimaList = newLm;
    } else {
      var tmpLm = this.m_MinimaList;
      while (tmpLm.Next !== null && newLm.Y < tmpLm.Next.Y) tmpLm = tmpLm.Next;
      newLm.Next = tmpLm.Next;
      tmpLm.Next = newLm;
    }
  }

  FindNextLocMin(E: TEdge): TEdge {
    var E2;
    for (;;) {
      while (
        IntPoint.op_Inequality(E.Bot, E.Prev.Bot) ||
        IntPoint.op_Equality(E.Curr, E.Top)
      )
        E = E.Next;
      if (E.Dx != Clipper.horizontal && E.Prev.Dx != Clipper.horizontal) break;
      while (E.Prev.Dx == Clipper.horizontal) E = E.Prev;
      E2 = E;
      while (E.Dx == Clipper.horizontal) E = E.Next;
      if (E.Top.Y == E.Prev.Bot.Y) continue;
      //ie just an intermediate horz.
      if (E2.Prev.Bot.X < E.Bot.X) E = E2;
      break;
    }
    return E;
  }

  public Pt2IsBetweenPt1AndPt3(
    pt1: IntPoint,
    pt2: IntPoint,
    pt3: IntPoint
  ): boolean {
    if (
      IntPoint.op_Equality(pt1, pt3) ||
      IntPoint.op_Equality(pt1, pt2) ||
      IntPoint.op_Equality(pt3, pt2)
    )
      return false;
    else if (pt1.X != pt3.X) return pt2.X > pt1.X == pt2.X < pt3.X;
    else return pt2.Y > pt1.Y == pt2.Y < pt3.Y;
  }

  public InitEdge2(e: TEdge, polyType: PolyType) {
    if (e.Curr.Y >= e.Next.Curr.Y) {
      //e.Bot = e.Curr;
      e.Bot.X = e.Curr.X;
      e.Bot.Y = e.Curr.Y;
      //e.Top = e.Next.Curr;
      e.Top.X = e.Next.Curr.X;
      e.Top.Y = e.Next.Curr.Y;
    } else {
      //e.Top = e.Curr;
      e.Top.X = e.Curr.X;
      e.Top.Y = e.Curr.Y;
      //e.Bot = e.Next.Curr;
      e.Bot.X = e.Next.Curr.X;
      e.Bot.Y = e.Next.Curr.Y;
    }
    this.SetDx(e);
    e.PolyTyp = polyType;
  }

  public SetDx(e: TEdge): void {
    e.Delta.X = e.Top.X - e.Bot.X;
    e.Delta.Y = e.Top.Y - e.Bot.Y;
    if (e.Delta.Y === 0) e.Dx = Clipper.horizontal;
    else e.Dx = e.Delta.X / e.Delta.Y;
  }

  public Execute(
    clipType: ClipType,
    solution: IntPoint[][],
    subjFillType: PolyFillType,
    clipFillType: PolyFillType
  ): boolean {
    if (this.m_ExecuteLocked) return false;
    if (this.m_HasOpenPaths)
      console.error("Error: PolyTree struct is need for open path clipping.");
    this.m_ExecuteLocked = true;
    Clipper.Clear(solution);
    this.m_SubjFillType = subjFillType;
    this.m_ClipFillType = clipFillType;
    this.m_ClipType = clipType;
    this.m_UsingPolyTree = false;

    try {
      var succeeded = this.ExecuteInternal();
      //build the return polygons ...
      if (succeeded) this.BuildResult(solution);
    } finally {
      this.DisposeAllPolyPts();
      this.m_ExecuteLocked = false;
    }
    return succeeded;
  }

  public DisposeAllPolyPts() {
    for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; ++i)
      this.DisposeOutRec(i);
    Clipper.Clear(this.m_PolyOuts);
  }

  public DisposeOutRec(index: number) {
    var outRec = this.m_PolyOuts[index];
    if (outRec.Pts !== null) this.DisposeOutPts(outRec.Pts);
    outRec = null;
    this.m_PolyOuts[index] = null;
  }

  public BuildResult(polyg: IntPoint[][]) {
    Clipper.Clear(polyg);
    for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
      var outRec = this.m_PolyOuts[i];
      if (outRec.Pts === null) continue;
      var p = outRec.Pts.Prev;
      var cnt = this.PointCount(p);
      if (cnt < 2) continue;
      var pg = new Array(cnt);
      for (var j = 0; j < cnt; j++) {
        pg[j] = p.Pt;
        p = p.Prev;
      }
      polyg.push(pg);
    }
  }

  public PointCount(pts: OutPt): number {
    if (pts === null) return 0;
    var result = 0;
    var p = pts;
    do {
      result++;
      p = p.Next;
    } while (p != pts);
    return result;
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
    if (edge1.PrevInAEL === null) this.m_ActiveEdges = edge1;
    else if (edge2.PrevInAEL === null) this.m_ActiveEdges = edge2;
  }

  public DisposeOutPts(pp: OutPt): void {
    if (pp === null) return;
    var tmpPp = null;
    pp.Prev.Next = null;
    while (pp !== null) {
      tmpPp = pp;
      pp = pp.Next;
      tmpPp = null;
    }
  }

  public IsIntermediate(e: TEdge, Y: number): boolean {
    return e.Top.Y == Y && e.NextInLML !== null;
  }

  public IsMaxima(e: TEdge, Y: number): boolean {
    return e !== null && e.Top.Y == Y && e.NextInLML === null;
  }

  public AddEdgeToSEL(edge: TEdge): void {
    //SEL pointers in PEdge are reused to build a list of horizontal edges.
    //However, we don't need to worry about order with horizontal edge processing.
    if (this.m_SortedEdges === null) {
      this.m_SortedEdges = edge;
      edge.PrevInSEL = null;
      edge.NextInSEL = null;
    } else {
      edge.NextInSEL = this.m_SortedEdges;
      edge.PrevInSEL = null;
      this.m_SortedEdges.PrevInSEL = edge;
      this.m_SortedEdges = edge;
    }
  }

  public AddLocalMaxPoly(e1: TEdge, e2: TEdge, pt: IntPoint): void {
    this.AddOutPt(e1, pt);
    if (e2.WindDelta == 0) this.AddOutPt(e2, pt);
    if (e1.OutIdx == e2.OutIdx) {
      e1.OutIdx = -1;
      e2.OutIdx = -1;
    } else if (e1.OutIdx < e2.OutIdx) this.AppendPolygon(e1, e2);
    else this.AppendPolygon(e2, e1);
  }

  public AppendPolygon(e1: TEdge, e2: TEdge): void {
    //get the start and ends of both output polygons ...
    var outRec1 = this.m_PolyOuts[e1.OutIdx];
    var outRec2 = this.m_PolyOuts[e2.OutIdx];
    var holeStateRec;
    if (this.Param1RightOfParam2(outRec1, outRec2)) holeStateRec = outRec2;
    else if (this.Param1RightOfParam2(outRec2, outRec1)) holeStateRec = outRec1;
    else holeStateRec = this.GetLowermostRec(outRec1, outRec2);
    var p1_lft = outRec1.Pts;
    var p1_rt = p1_lft.Prev;
    var p2_lft = outRec2.Pts;
    var p2_rt = p2_lft.Prev;
    var side;
    //join e2 poly onto e1 poly and delete pointers to e2 ...
    if (e1.Side == EdgeSide.esLeft) {
      if (e2.Side == EdgeSide.esLeft) {
        //z y x a b c
        this.ReversePolyPtLinks(p2_lft);
        p2_lft.Next = p1_lft;
        p1_lft.Prev = p2_lft;
        p1_rt.Next = p2_rt;
        p2_rt.Prev = p1_rt;
        outRec1.Pts = p2_rt;
      } else {
        //x y z a b c
        p2_rt.Next = p1_lft;
        p1_lft.Prev = p2_rt;
        p2_lft.Prev = p1_rt;
        p1_rt.Next = p2_lft;
        outRec1.Pts = p2_lft;
      }
      side = EdgeSide.esLeft;
    } else {
      if (e2.Side == EdgeSide.esRight) {
        //a b c z y x
        this.ReversePolyPtLinks(p2_lft);
        p1_rt.Next = p2_rt;
        p2_rt.Prev = p1_rt;
        p2_lft.Next = p1_lft;
        p1_lft.Prev = p2_lft;
      } else {
        //a b c x y z
        p1_rt.Next = p2_lft;
        p2_lft.Prev = p1_rt;
        p1_lft.Prev = p2_rt;
        p2_rt.Next = p1_lft;
      }
      side = EdgeSide.esRight;
    }
    outRec1.BottomPt = null;
    if (holeStateRec == outRec2) {
      if (outRec2.FirstLeft != outRec1) outRec1.FirstLeft = outRec2.FirstLeft;
      outRec1.IsHole = outRec2.IsHole;
    }
    outRec2.Pts = null;
    outRec2.BottomPt = null;
    outRec2.FirstLeft = outRec1;
    var OKIdx = e1.OutIdx;
    var ObsoleteIdx = e2.OutIdx;
    e1.OutIdx = -1;
    //nb: safe because we only get here via AddLocalMaxPoly
    e2.OutIdx = -1;
    var e = this.m_ActiveEdges;
    while (e !== null) {
      if (e.OutIdx == ObsoleteIdx) {
        e.OutIdx = OKIdx;
        e.Side = side;
        break;
      }
      e = e.NextInAEL;
    }
    outRec2.Idx = outRec1.Idx;
  }

  public static SwapSides(edge1: TEdge, edge2: TEdge) {
    var side = edge1.Side;
    edge1.Side = edge2.Side;
    edge2.Side = side;
  }

  public static SwapPolyIndexes(edge1: TEdge, edge2: TEdge) {
    var outIdx = edge1.OutIdx;
    edge1.OutIdx = edge2.OutIdx;
    edge2.OutIdx = outIdx;
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
          this.AddLocalMaxPoly(e1, e2, pt);
      }
      //if intersecting a subj line with a subj poly ...
      else if (
        e1.PolyTyp == e2.PolyTyp &&
        e1.WindDelta != e2.WindDelta &&
        this.m_ClipType == ClipType.ctUnion
      ) {
        if (e1.WindDelta === 0) {
          if (e2Contributing) {
            this.AddOutPt(e1, pt);
            if (e1Contributing) e1.OutIdx = -1;
          }
        } else {
          if (e1Contributing) {
            this.AddOutPt(e2, pt);
            if (e2Contributing) e2.OutIdx = -1;
          }
        }
      } else if (e1.PolyTyp != e2.PolyTyp) {
        if (
          e1.WindDelta === 0 &&
          Math.abs(e2.WindCnt) == 1 &&
          (this.m_ClipType != ClipType.ctUnion || e2.WindCnt2 === 0)
        ) {
          this.AddOutPt(e1, pt);
          if (e1Contributing) e1.OutIdx = -1;
        } else if (
          e2.WindDelta === 0 &&
          Math.abs(e1.WindCnt) == 1 &&
          (this.m_ClipType != ClipType.ctUnion || e1.WindCnt2 === 0)
        ) {
          this.AddOutPt(e2, pt);
          if (e2Contributing) e2.OutIdx = -1;
        }
      }
      if (e1stops)
        if (e1.OutIdx < 0) this.DeleteFromAEL(e1);
        else console.error("Error intersecting polylines");
      if (e2stops)
        if (e2.OutIdx < 0) this.DeleteFromAEL(e2);
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
    if (e1.PolyTyp == PolyType.ptSubject) {
      e1FillType = this.m_SubjFillType;
      e1FillType2 = this.m_ClipFillType;
    } else {
      e1FillType = this.m_ClipFillType;
      e1FillType2 = this.m_SubjFillType;
    }
    if (e2.PolyTyp == PolyType.ptSubject) {
      e2FillType = this.m_SubjFillType;
      e2FillType2 = this.m_ClipFillType;
    } else {
      e2FillType = this.m_ClipFillType;
      e2FillType2 = this.m_SubjFillType;
    }
    var e1Wc, e2Wc;
    switch (e1FillType) {
      case PolyFillType.pftPositive:
        e1Wc = e1.WindCnt;
        break;
      case PolyFillType.pftNegative:
        e1Wc = -e1.WindCnt;
        break;
      default:
        e1Wc = Math.abs(e1.WindCnt);
        break;
    }
    switch (e2FillType) {
      case PolyFillType.pftPositive:
        e2Wc = e2.WindCnt;
        break;
      case PolyFillType.pftNegative:
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
        (e1.PolyTyp != e2.PolyTyp && this.m_ClipType != ClipType.ctXor)
      )
        this.AddLocalMaxPoly(e1, e2, pt);
      else {
        this.AddOutPt(e1, pt);
        this.AddOutPt(e2, pt);
        Clipper.SwapSides(e1, e2);
        Clipper.SwapPolyIndexes(e1, e2);
      }
    } else if (e1Contributing) {
      if (e2Wc === 0 || e2Wc == 1) {
        this.AddOutPt(e1, pt);
        Clipper.SwapSides(e1, e2);
        Clipper.SwapPolyIndexes(e1, e2);
      }
    } else if (e2Contributing) {
      if (e1Wc === 0 || e1Wc == 1) {
        this.AddOutPt(e2, pt);
        Clipper.SwapSides(e1, e2);
        Clipper.SwapPolyIndexes(e1, e2);
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
        case PolyFillType.pftPositive:
          e1Wc2 = e1.WindCnt2;
          break;
        case PolyFillType.pftNegative:
          e1Wc2 = -e1.WindCnt2;
          break;
        default:
          e1Wc2 = Math.abs(e1.WindCnt2);
          break;
      }
      switch (e2FillType2) {
        case PolyFillType.pftPositive:
          e2Wc2 = e2.WindCnt2;
          break;
        case PolyFillType.pftNegative:
          e2Wc2 = -e2.WindCnt2;
          break;
        default:
          e2Wc2 = Math.abs(e2.WindCnt2);
          break;
      }
      if (e1.PolyTyp != e2.PolyTyp) this.AddLocalMinPoly(e1, e2, pt);
      else if (e1Wc == 1 && e2Wc == 1)
        switch (this.m_ClipType) {
          case ClipType.ctIntersection:
            if (e1Wc2 > 0 && e2Wc2 > 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipType.ctUnion:
            if (e1Wc2 <= 0 && e2Wc2 <= 0) this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipType.ctDifference:
            if (
              (e1.PolyTyp == PolyType.ptClip && e1Wc2 > 0 && e2Wc2 > 0) ||
              (e1.PolyTyp == PolyType.ptSubject && e1Wc2 <= 0 && e2Wc2 <= 0)
            )
              this.AddLocalMinPoly(e1, e2, pt);
            break;
          case ClipType.ctXor:
            this.AddLocalMinPoly(e1, e2, pt);
            break;
        }
      else Clipper.SwapSides(e1, e2);
    }
    if (
      e1stops != e2stops &&
      ((e1stops && e1.OutIdx >= 0) || (e2stops && e2.OutIdx >= 0))
    ) {
      Clipper.SwapSides(e1, e2);
      Clipper.SwapPolyIndexes(e1, e2);
    }
    //finally, delete any non-contributing maxima edges  ...
    if (e1stops) this.DeleteFromAEL(e1);
    if (e2stops) this.DeleteFromAEL(e2);
  }

  public DoMaxima(e: TEdge): void {
    var eMaxPair = this.GetMaximaPair(e);
    if (eMaxPair === null) {
      if (e.OutIdx >= 0) this.AddOutPt(e, e.Top);
      this.DeleteFromAEL(e);
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
      this.DeleteFromAEL(e);
      this.DeleteFromAEL(eMaxPair);
    } else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0) {
      this.IntersectEdges(e, eMaxPair, e.Top, false);
    } else if (use_lines && e.WindDelta === 0) {
      if (e.OutIdx >= 0) {
        this.AddOutPt(e, e.Top);
        e.OutIdx = -1;
      }
      this.DeleteFromAEL(e);
      if (eMaxPair.OutIdx >= 0) {
        this.AddOutPt(eMaxPair, e.Top);
        eMaxPair.OutIdx = -1;
      }
      this.DeleteFromAEL(eMaxPair);
    } else console.error("DoMaxima error");
  }

  public AddJoin(Op1: OutPt, Op2: OutPt, OffPt: IntPoint) {
    var j = new Join();
    j.OutPt1 = Op1;
    j.OutPt2 = Op2;
    //j.OffPt = OffPt;
    j.OffPt.X = OffPt.X;
    j.OffPt.Y = OffPt.Y;
    this.m_Joins.push(j);
  }

  public ProcessEdgesAtTopOfScanbeam(topY: number) {
    var e = this.m_ActiveEdges;
    while (e !== null) {
      //1. process maxima, treating them as if they're 'bent' horizontal edges,
      //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
      var IsMaximaEdge = this.IsMaxima(e, topY);
      if (IsMaximaEdge) {
        var eMaxPair = this.GetMaximaPair(e);
        IsMaximaEdge = eMaxPair === null || !Clipper.IsHorizontal(eMaxPair);
      }
      if (IsMaximaEdge) {
        var ePrev = e.PrevInAEL;
        this.DoMaxima(e);
        if (ePrev === null) e = this.m_ActiveEdges;
        else e = ePrev.NextInAEL;
      } else {
        //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
        if (this.IsIntermediate(e, topY) && Clipper.IsHorizontal(e.NextInLML)) {
          e = this.UpdateEdgeIntoAEL(e);
          if (e.OutIdx >= 0) this.AddOutPt(e, e.Bot);
          this.AddEdgeToSEL(e);
        } else {
          e.Curr.X = Clipper.TopX(e, topY);
          e.Curr.Y = topY;
        }
        if (this.StrictlySimple) {
          var ePrev = e.PrevInAEL;
          if (
            e.OutIdx >= 0 &&
            e.WindDelta !== 0 &&
            ePrev !== null &&
            ePrev.OutIdx >= 0 &&
            ePrev.Curr.X == e.Curr.X &&
            ePrev.WindDelta !== 0
          ) {
            var op = this.AddOutPt(ePrev, e.Curr);
            var op2 = this.AddOutPt(e, e.Curr);
            this.AddJoin(op, op2, e.Curr);
            //StrictlySimple (type-3) join
          }
        }
        e = e.NextInAEL;
      }
    }
    //3. Process horizontals at the Top of the scanbeam ...
    this.ProcessHorizontals(true);
    //4. Promote intermediate vertices ...
    e = this.m_ActiveEdges;
    while (e !== null) {
      if (this.IsIntermediate(e, topY)) {
        var op: OutPt = null;
        if (e.OutIdx >= 0) op = this.AddOutPt(e, e.Top);
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
          Clipper.SlopesEqualEdge(e, ePrev, this.m_UseFullRange) &&
          e.WindDelta !== 0 &&
          ePrev.WindDelta !== 0
        ) {
          var op2 = this.AddOutPt(ePrev, e.Bot);
          this.AddJoin(op, op2, e.Top);
        } else if (
          eNext !== null &&
          eNext.Curr.X == e.Bot.X &&
          eNext.Curr.Y == e.Bot.Y &&
          op !== null &&
          eNext.OutIdx >= 0 &&
          eNext.Curr.Y > eNext.Top.Y &&
          Clipper.SlopesEqualEdge(e, eNext, this.m_UseFullRange) &&
          e.WindDelta !== 0 &&
          eNext.WindDelta !== 0
        ) {
          var op2 = this.AddOutPt(eNext, e.Bot);
          this.AddJoin(op, op2, e.Top);
        }
      }
      e = e.NextInAEL;
    }
  }

  public EdgesAdjacent(inode: IntersectNode) {
    return (
      inode.Edge1.NextInSEL == inode.Edge2 ||
      inode.Edge1.PrevInSEL == inode.Edge2
    );
  }

  public CopyAELToSEL(): void {
    var e = this.m_ActiveEdges;
    this.m_SortedEdges = e;
    while (e !== null) {
      e.PrevInSEL = e.PrevInAEL;
      e.NextInSEL = e.NextInAEL;
      e = e.NextInAEL;
    }
  }

  public FixupIntersectionOrder(): boolean {
    //pre-condition: intersections are sorted bottom-most first.
    //Now it's crucial that intersections are made only between adjacent edges,
    //so to ensure this the order of intersections may need adjusting ...
    this.m_IntersectList.sort(this.m_IntersectNodeComparer);
    this.CopyAELToSEL();
    var cnt = this.m_IntersectList.length;
    for (var i = 0; i < cnt; i++) {
      if (!this.EdgesAdjacent(this.m_IntersectList[i])) {
        var j = i + 1;
        while (j < cnt && !this.EdgesAdjacent(this.m_IntersectList[j])) j++;
        if (j == cnt) return false;
        var tmp = this.m_IntersectList[i];
        this.m_IntersectList[i] = this.m_IntersectList[j];
        this.m_IntersectList[j] = tmp;
      }
      this.SwapPositionsInSEL(
        this.m_IntersectList[i].Edge1,
        this.m_IntersectList[i].Edge2
      );
    }
    return true;
  }

  public SwapPositionsInSEL(edge1: TEdge, edge2: TEdge) {
    if (edge1.NextInSEL === null && edge1.PrevInSEL === null) return;
    if (edge2.NextInSEL === null && edge2.PrevInSEL === null) return;
    if (edge1.NextInSEL == edge2) {
      var next = edge2.NextInSEL;
      if (next !== null) next.PrevInSEL = edge1;
      var prev = edge1.PrevInSEL;
      if (prev !== null) prev.NextInSEL = edge2;
      edge2.PrevInSEL = prev;
      edge2.NextInSEL = edge1;
      edge1.PrevInSEL = edge2;
      edge1.NextInSEL = next;
    } else if (edge2.NextInSEL == edge1) {
      var next = edge1.NextInSEL;
      if (next !== null) next.PrevInSEL = edge2;
      var prev = edge2.PrevInSEL;
      if (prev !== null) prev.NextInSEL = edge1;
      edge1.PrevInSEL = prev;
      edge1.NextInSEL = edge2;
      edge2.PrevInSEL = edge1;
      edge2.NextInSEL = next;
    } else {
      var next = edge1.NextInSEL;
      var prev = edge1.PrevInSEL;
      edge1.NextInSEL = edge2.NextInSEL;
      if (edge1.NextInSEL !== null) edge1.NextInSEL.PrevInSEL = edge1;
      edge1.PrevInSEL = edge2.PrevInSEL;
      if (edge1.PrevInSEL !== null) edge1.PrevInSEL.NextInSEL = edge1;
      edge2.NextInSEL = next;
      if (edge2.NextInSEL !== null) edge2.NextInSEL.PrevInSEL = edge2;
      edge2.PrevInSEL = prev;
      if (edge2.PrevInSEL !== null) edge2.PrevInSEL.NextInSEL = edge2;
    }
    if (edge1.PrevInSEL === null) this.m_SortedEdges = edge1;
    else if (edge2.PrevInSEL === null) this.m_SortedEdges = edge2;
  }

  public IntersectPoint(edge1: TEdge, edge2: TEdge, ip: IntPoint): boolean {
    ip.X = 0;
    ip.Y = 0;
    var b1, b2;
    //nb: with very large coordinate values, it's possible for SlopesEqual() to
    //return false but for the edge.Dx value be equal due to double precision rounding.
    if (
      Clipper.SlopesEqualEdge(edge1, edge2, this.m_UseFullRange) ||
      edge1.Dx == edge2.Dx
    ) {
      if (edge2.Bot.Y > edge1.Bot.Y) {
        ip.X = edge2.Bot.X;
        ip.Y = edge2.Bot.Y;
      } else {
        ip.X = edge1.Bot.X;
        ip.Y = edge1.Bot.Y;
      }
      return false;
    } else if (edge1.Delta.X === 0) {
      ip.X = edge1.Bot.X;
      if (Clipper.IsHorizontal(edge2)) {
        ip.Y = edge2.Bot.Y;
      } else {
        b2 = edge2.Bot.Y - edge2.Bot.X / edge2.Dx;
        ip.Y = Clipper.Round(ip.X / edge2.Dx + b2);
      }
    } else if (edge2.Delta.X === 0) {
      ip.X = edge2.Bot.X;
      if (Clipper.IsHorizontal(edge1)) {
        ip.Y = edge1.Bot.Y;
      } else {
        b1 = edge1.Bot.Y - edge1.Bot.X / edge1.Dx;
        ip.Y = Clipper.Round(ip.X / edge1.Dx + b1);
      }
    } else {
      b1 = edge1.Bot.X - edge1.Bot.Y * edge1.Dx;
      b2 = edge2.Bot.X - edge2.Bot.Y * edge2.Dx;
      var q = (b2 - b1) / (edge1.Dx - edge2.Dx);
      ip.Y = Clipper.Round(q);
      if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx))
        ip.X = Clipper.Round(edge1.Dx * q + b1);
      else ip.X = Clipper.Round(edge2.Dx * q + b2);
    }
    if (ip.Y < edge1.Top.Y || ip.Y < edge2.Top.Y) {
      if (edge1.Top.Y > edge2.Top.Y) {
        ip.Y = edge1.Top.Y;
        ip.X = Clipper.TopX(edge2, edge1.Top.Y);
        return ip.X < edge1.Top.X;
      } else ip.Y = edge2.Top.Y;
      if (Math.abs(edge1.Dx) < Math.abs(edge2.Dx))
        ip.X = Clipper.TopX(edge1, ip.Y);
      else ip.X = Clipper.TopX(edge2, ip.Y);
    }
    return true;
  }

  public BuildIntersectList(botY: number, topY: number): void {
    if (this.m_ActiveEdges === null) return;
    //prepare for sorting ...
    var e = this.m_ActiveEdges;
    //console.log(JSON.stringify(JSON.decycle( e )));
    this.m_SortedEdges = e;
    while (e !== null) {
      e.PrevInSEL = e.PrevInAEL;
      e.NextInSEL = e.NextInAEL;
      e.Curr.X = Clipper.TopX(e, topY);
      e = e.NextInAEL;
    }
    //bubblesort ...
    var isModified = true;
    while (isModified && this.m_SortedEdges !== null) {
      isModified = false;
      e = this.m_SortedEdges;
      while (e.NextInSEL !== null) {
        var eNext = e.NextInSEL;
        var pt = new IntPoint();
        //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
        if (e.Curr.X > eNext.Curr.X) {
          if (
            !this.IntersectPoint(e, eNext, pt) &&
            e.Curr.X > eNext.Curr.X + 1
          ) {
            //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
            //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
            console.error("Intersection error");
          }
          if (pt.Y > botY) {
            pt.Y = botY;
            if (Math.abs(e.Dx) > Math.abs(eNext.Dx))
              pt.X = Clipper.TopX(eNext, botY);
            else pt.X = Clipper.TopX(e, botY);
          }
          var newNode = new IntersectNode();
          newNode.Edge1 = e;
          newNode.Edge2 = eNext;
          //newNode.Pt = pt;
          newNode.Pt.X = pt.X;
          newNode.Pt.Y = pt.Y;
          this.m_IntersectList.push(newNode);
          this.SwapPositionsInSEL(e, eNext);
          isModified = true;
        } else e = eNext;
      }
      if (e.PrevInSEL !== null) e.PrevInSEL.NextInSEL = null;
      else break;
    }
    this.m_SortedEdges = null;
  }

  public ProcessIntersectList() {
    for (var i = 0, ilen = this.m_IntersectList.length; i < ilen; i++) {
      var iNode = this.m_IntersectList[i];
      this.IntersectEdges(iNode.Edge1, iNode.Edge2, iNode.Pt, true);
      this.SwapPositionsInAEL(iNode.Edge1, iNode.Edge2);
    }
    this.m_IntersectList.length = 0;
  }

  public ProcessIntersections(botY: number, topY: number): boolean {
    if (this.m_ActiveEdges == null) return true;
    try {
      this.BuildIntersectList(botY, topY);
      if (this.m_IntersectList.length == 0) return true;
      if (this.m_IntersectList.length == 1 || this.FixupIntersectionOrder())
        this.ProcessIntersectList();
      else return false;
    } catch ($$e2) {
      this.m_SortedEdges = null;
      this.m_IntersectList.length = 0;
      console.error("ProcessIntersections error");
    }
    this.m_SortedEdges = null;
    return true;
  }

  public PopLocalMinima() {
    if (this.m_CurrentLM === null) return;
    this.m_CurrentLM = this.m_CurrentLM.Next;
  }

  public E2InsertsBeforeE1(e1: TEdge, e2: TEdge): boolean {
    if (e2.Curr.X == e1.Curr.X) {
      if (e2.Top.Y > e1.Top.Y) return e2.Top.X < Clipper.TopX(e1, e2.Top.Y);
      else return e1.Top.X > Clipper.TopX(e2, e1.Top.Y);
    } else return e2.Curr.X < e1.Curr.X;
  }

  public InsertEdgeIntoAEL(edge: TEdge, startEdge: TEdge): void {
    if (this.m_ActiveEdges === null) {
      edge.PrevInAEL = null;
      edge.NextInAEL = null;
      this.m_ActiveEdges = edge;
    } else if (
      startEdge === null &&
      this.E2InsertsBeforeE1(this.m_ActiveEdges, edge)
    ) {
      edge.PrevInAEL = null;
      edge.NextInAEL = this.m_ActiveEdges;
      this.m_ActiveEdges.PrevInAEL = edge;
      this.m_ActiveEdges = edge;
    } else {
      if (startEdge === null) startEdge = this.m_ActiveEdges;
      while (
        startEdge.NextInAEL !== null &&
        !this.E2InsertsBeforeE1(startEdge.NextInAEL, edge)
      )
        startEdge = startEdge.NextInAEL;
      edge.NextInAEL = startEdge.NextInAEL;
      if (startEdge.NextInAEL !== null) startEdge.NextInAEL.PrevInAEL = edge;
      edge.PrevInAEL = startEdge;
      startEdge.NextInAEL = edge;
    }
  }

  public IsEvenOddFillType(edge: TEdge): boolean {
    if (edge.PolyTyp == PolyType.ptSubject)
      return this.m_SubjFillType == PolyFillType.pftEvenOdd;
    else return this.m_ClipFillType == PolyFillType.pftEvenOdd;
  }

  public IsEvenOddAltFillType(edge: TEdge): boolean {
    if (edge.PolyTyp == PolyType.ptSubject)
      return this.m_ClipFillType == PolyFillType.pftEvenOdd;
    else return this.m_SubjFillType == PolyFillType.pftEvenOdd;
  }

  public SetWindingCount(edge: TEdge): void {
    var e = edge.PrevInAEL;
    //find the edge of the same polytype that immediately preceeds 'edge' in AEL
    while (e !== null && (e.PolyTyp != edge.PolyTyp || e.WindDelta === 0))
      e = e.PrevInAEL;
    if (e === null) {
      edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
      edge.WindCnt2 = 0;
      e = this.m_ActiveEdges;
      //ie get ready to calc WindCnt2
    } else if (edge.WindDelta === 0 && this.m_ClipType != ClipType.ctUnion) {
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

  IsContributing(edge: TEdge): boolean {
    var pft, pft2;
    if (edge.PolyTyp == PolyType.ptSubject) {
      pft = this.m_SubjFillType;
      pft2 = this.m_ClipFillType;
    } else {
      pft = this.m_ClipFillType;
      pft2 = this.m_SubjFillType;
    }
    switch (pft) {
      case PolyFillType.pftEvenOdd:
        if (edge.WindDelta === 0 && edge.WindCnt != 1) return false;
        break;
      case PolyFillType.pftNonZero:
        if (Math.abs(edge.WindCnt) != 1) return false;
        break;
      case PolyFillType.pftPositive:
        if (edge.WindCnt != 1) return false;
        break;
      default:
        if (edge.WindCnt != -1) return false;
        break;
    }
    switch (this.m_ClipType) {
      case ClipType.ctIntersection:
        switch (pft2) {
          case PolyFillType.pftEvenOdd:
          case PolyFillType.pftNonZero:
            return edge.WindCnt2 !== 0;
          case PolyFillType.pftPositive:
            return edge.WindCnt2 > 0;
          default:
            return edge.WindCnt2 < 0;
        }
      case ClipType.ctUnion:
        switch (pft2) {
          case PolyFillType.pftEvenOdd:
          case PolyFillType.pftNonZero:
            return edge.WindCnt2 === 0;
          case PolyFillType.pftPositive:
            return edge.WindCnt2 <= 0;
          default:
            return edge.WindCnt2 >= 0;
        }
      case ClipType.ctDifference:
        if (edge.PolyTyp == PolyType.ptSubject)
          switch (pft2) {
            case PolyFillType.pftEvenOdd:
            case PolyFillType.pftNonZero:
              return edge.WindCnt2 === 0;
            case PolyFillType.pftPositive:
              return edge.WindCnt2 <= 0;
            default:
              return edge.WindCnt2 >= 0;
          }
        else
          switch (pft2) {
            case PolyFillType.pftEvenOdd:
            case PolyFillType.pftNonZero:
              return edge.WindCnt2 !== 0;
            case PolyFillType.pftPositive:
              return edge.WindCnt2 > 0;
            default:
              return edge.WindCnt2 < 0;
          }
      case ClipType.ctXor:
        if (edge.WindDelta === 0)
          switch (pft2) {
            case PolyFillType.pftEvenOdd:
            case PolyFillType.pftNonZero:
              return edge.WindCnt2 === 0;
            case PolyFillType.pftPositive:
              return edge.WindCnt2 <= 0;
            default:
              return edge.WindCnt2 >= 0;
          }
        else return true;
    }
    return true;
  }

  public AddLocalMinPoly(e1: TEdge, e2: TEdge, pt: IntPoint) {
    var result;
    var e, prevE;
    if (Clipper.IsHorizontal(e2) || e1.Dx > e2.Dx) {
      result = this.AddOutPt(e1, pt);
      e2.OutIdx = e1.OutIdx;
      e1.Side = EdgeSide.esLeft;
      e2.Side = EdgeSide.esRight;
      e = e1;
      if (e.PrevInAEL == e2) prevE = e2.PrevInAEL;
      else prevE = e.PrevInAEL;
    } else {
      result = this.AddOutPt(e2, pt);
      e1.OutIdx = e2.OutIdx;
      e1.Side = EdgeSide.esRight;
      e2.Side = EdgeSide.esLeft;
      e = e2;
      if (e.PrevInAEL == e1) prevE = e1.PrevInAEL;
      else prevE = e.PrevInAEL;
    }
    if (
      prevE !== null &&
      prevE.OutIdx >= 0 &&
      Clipper.TopX(prevE, pt.Y) == Clipper.TopX(e, pt.Y) &&
      Clipper.SlopesEqualEdge(e, prevE, this.m_UseFullRange) &&
      e.WindDelta !== 0 &&
      prevE.WindDelta !== 0
    ) {
      var outPt = this.AddOutPt(prevE, pt);
      this.AddJoin(result, outPt, e.Top);
    }
    return result;
  }

  public HorzSegmentsOverlap(
    Pt1a: IntPoint,
    Pt1b: IntPoint,
    Pt2a: IntPoint,
    Pt2b: IntPoint
  ): boolean {
    //precondition: both segments are horizontal
    if (Pt1a.X > Pt2a.X == Pt1a.X < Pt2b.X) return true;
    else if (Pt1b.X > Pt2a.X == Pt1b.X < Pt2b.X) return true;
    else if (Pt2a.X > Pt1a.X == Pt2a.X < Pt1b.X) return true;
    else if (Pt2b.X > Pt1a.X == Pt2b.X < Pt1b.X) return true;
    else if (Pt1a.X == Pt2a.X && Pt1b.X == Pt2b.X) return true;
    else if (Pt1a.X == Pt2b.X && Pt1b.X == Pt2a.X) return true;
    else return false;
  }

  public InsertLocalMinimaIntoAEL(botY: number) {
    while (this.m_CurrentLM !== null && this.m_CurrentLM.Y == botY) {
      var lb = this.m_CurrentLM.LeftBound;
      var rb = this.m_CurrentLM.RightBound;
      this.PopLocalMinima();
      var Op1 = null;
      if (lb === null) {
        this.InsertEdgeIntoAEL(rb, null);
        this.SetWindingCount(rb);
        if (this.IsContributing(rb)) Op1 = this.AddOutPt(rb, rb.Bot);
      } else if (rb == null) {
        this.InsertEdgeIntoAEL(lb, null);
        this.SetWindingCount(lb);
        if (this.IsContributing(lb)) Op1 = this.AddOutPt(lb, lb.Bot);
        this.InsertScanbeam(lb.Top.Y);
      } else {
        this.InsertEdgeIntoAEL(lb, null);
        this.InsertEdgeIntoAEL(rb, lb);
        this.SetWindingCount(lb);
        rb.WindCnt = lb.WindCnt;
        rb.WindCnt2 = lb.WindCnt2;
        if (this.IsContributing(lb)) Op1 = this.AddLocalMinPoly(lb, rb, lb.Bot);
        this.InsertScanbeam(lb.Top.Y);
      }
      if (rb != null) {
        if (Clipper.IsHorizontal(rb)) this.AddEdgeToSEL(rb);
        else this.InsertScanbeam(rb.Top.Y);
      }
      if (lb == null || rb == null) continue;
      //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
      if (
        Op1 !== null &&
        Clipper.IsHorizontal(rb) &&
        this.m_GhostJoins.length > 0 &&
        rb.WindDelta !== 0
      ) {
        for (var i = 0, ilen = this.m_GhostJoins.length; i < ilen; i++) {
          //if the horizontal Rb and a 'ghost' horizontal overlap, then convert
          //the 'ghost' join to a real join ready for later ...
          var j = this.m_GhostJoins[i];
          if (this.HorzSegmentsOverlap(j.OutPt1.Pt, j.OffPt, rb.Bot, rb.Top))
            this.AddJoin(j.OutPt1, Op1, j.OffPt);
        }
      }
      if (
        lb.OutIdx >= 0 &&
        lb.PrevInAEL !== null &&
        lb.PrevInAEL.Curr.X == lb.Bot.X &&
        lb.PrevInAEL.OutIdx >= 0 &&
        Clipper.SlopesEqualEdge(lb.PrevInAEL, lb, this.m_UseFullRange) &&
        lb.WindDelta !== 0 &&
        lb.PrevInAEL.WindDelta !== 0
      ) {
        var Op2 = this.AddOutPt(lb.PrevInAEL, lb.Bot);
        this.AddJoin(Op1, Op2, lb.Top);
      }
      if (lb.NextInAEL != rb) {
        if (
          rb.OutIdx >= 0 &&
          rb.PrevInAEL.OutIdx >= 0 &&
          Clipper.SlopesEqualEdge(rb.PrevInAEL, rb, this.m_UseFullRange) &&
          rb.WindDelta !== 0 &&
          rb.PrevInAEL.WindDelta !== 0
        ) {
          var Op2 = this.AddOutPt(rb.PrevInAEL, rb.Bot);
          this.AddJoin(Op1, Op2, rb.Top);
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

  public ExecuteInternal() {
    try {
      this.Reset();
      if (this.m_CurrentLM === null) return false;
      var botY = this.PopScanbeam();
      do {
        this.InsertLocalMinimaIntoAEL(botY);
        Clipper.Clear(this.m_GhostJoins);
        this.ProcessHorizontals(false);
        if (this.m_Scanbeam === null) break;
        var topY = this.PopScanbeam();
        //console.log("botY:" + botY + ", topY:" + topY);
        if (!this.ProcessIntersections(botY, topY)) return false;
        this.ProcessEdgesAtTopOfScanbeam(topY);
        botY = topY;
      } while (this.m_Scanbeam !== null || this.m_CurrentLM !== null);
      //fix orientations ...
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
        var outRec = this.m_PolyOuts[i];
        if (outRec.Pts === null || outRec.IsOpen) continue;
        //@ts-ignore
        if ((outRec.IsHole ^ this.ReverseSolution) == this.Area(outRec) > 0)
          this.ReversePolyPtLinks(outRec.Pts);
      }
      this.JoinCommonEdges();
      for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
        var outRec = this.m_PolyOuts[i];
        if (outRec.Pts !== null && !outRec.IsOpen) this.FixupOutPolygon(outRec);
      }
      if (this.StrictlySimple) this.DoSimplePolygons();
      return true;
    } finally {
      Clipper.Clear(this.m_Joins);
      Clipper.Clear(this.m_GhostJoins);
    }
  }

  public GetOutRec(idx: number): OutRec {
    var outrec = this.m_PolyOuts[idx];
    while (outrec != this.m_PolyOuts[outrec.Idx])
      outrec = this.m_PolyOuts[outrec.Idx];
    return outrec;
  }

  public Area(outRec: OutRec): number {
    var op = outRec.Pts;
    if (op == null) return 0;
    var a = 0;
    do {
      a = a + (op.Prev.Pt.X + op.Pt.X) * (op.Prev.Pt.Y - op.Pt.Y);
      op = op.Next;
    } while (op != outRec.Pts);
    return a * 0.5;
  }

  public Param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
    do {
      outRec1 = outRec1.FirstLeft;
      if (outRec1 == outRec2) return true;
    } while (outRec1 !== null);
    return false;
  }

  public GetBottomPt(pp: OutPt) {
    var dups = null;
    var p = pp.Next;
    while (p != pp) {
      if (p.Pt.Y > pp.Pt.Y) {
        pp = p;
        dups = null;
      } else if (p.Pt.Y == pp.Pt.Y && p.Pt.X <= pp.Pt.X) {
        if (p.Pt.X < pp.Pt.X) {
          dups = null;
          pp = p;
        } else {
          if (p.Next != pp && p.Prev != pp) dups = p;
        }
      }
      p = p.Next;
    }
    if (dups !== null) {
      //there appears to be at least 2 vertices at bottomPt so ...
      while (dups != p) {
        if (!this.FirstIsBottomPt(p, dups)) pp = dups;
        dups = dups.Next;
        while (IntPoint.op_Inequality(dups.Pt, pp.Pt)) dups = dups.Next;
      }
    }
    return pp;
  }

  public GetLowermostRec(outRec1: OutRec, outRec2: OutRec) {
    //work out which polygon fragment has the correct hole state ...
    if (outRec1.BottomPt === null)
      outRec1.BottomPt = this.GetBottomPt(outRec1.Pts);
    if (outRec2.BottomPt === null)
      outRec2.BottomPt = this.GetBottomPt(outRec2.Pts);
    var bPt1 = outRec1.BottomPt;
    var bPt2 = outRec2.BottomPt;
    if (bPt1.Pt.Y > bPt2.Pt.Y) return outRec1;
    else if (bPt1.Pt.Y < bPt2.Pt.Y) return outRec2;
    else if (bPt1.Pt.X < bPt2.Pt.X) return outRec1;
    else if (bPt1.Pt.X > bPt2.Pt.X) return outRec2;
    else if (bPt1.Next == bPt1) return outRec2;
    else if (bPt2.Next == bPt2) return outRec1;
    else if (this.FirstIsBottomPt(bPt1, bPt2)) return outRec1;
    else return outRec2;
  }

  public FirstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt) {
    var p = btmPt1.Prev;
    while (IntPoint.op_Equality(p.Pt, btmPt1.Pt) && p != btmPt1) p = p.Prev;
    var dx1p = Math.abs(this.GetDx(btmPt1.Pt, p.Pt));
    p = btmPt1.Next;
    while (IntPoint.op_Equality(p.Pt, btmPt1.Pt) && p != btmPt1) p = p.Next;
    var dx1n = Math.abs(this.GetDx(btmPt1.Pt, p.Pt));
    p = btmPt2.Prev;
    while (IntPoint.op_Equality(p.Pt, btmPt2.Pt) && p != btmPt2) p = p.Prev;
    var dx2p = Math.abs(this.GetDx(btmPt2.Pt, p.Pt));
    p = btmPt2.Next;
    while (IntPoint.op_Equality(p.Pt, btmPt2.Pt) && p != btmPt2) p = p.Next;
    var dx2n = Math.abs(this.GetDx(btmPt2.Pt, p.Pt));
    return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
  }

  public GetDx(pt1: IntPoint, pt2: IntPoint) {
    if (pt1.Y == pt2.Y) return Clipper.horizontal;
    else return (pt2.X - pt1.X) / (pt2.Y - pt1.Y);
  }

  public DupOutPt(outPt: OutPt, InsertAfter: boolean): OutPt {
    var result = new OutPt();
    //result.Pt = outPt.Pt;
    result.Pt.X = outPt.Pt.X;
    result.Pt.Y = outPt.Pt.Y;
    result.Idx = outPt.Idx;
    if (InsertAfter) {
      result.Next = outPt.Next;
      result.Prev = outPt;
      outPt.Next.Prev = result;
      outPt.Next = result;
    } else {
      result.Prev = outPt.Prev;
      result.Next = outPt;
      outPt.Prev.Next = result;
      outPt.Prev = result;
    }
    return result;
  }

  public JoinHorz(
    op1: OutPt,
    op1b: OutPt,
    op2: OutPt,
    op2b: OutPt,
    Pt: IntPoint,
    DiscardLeft: boolean
  ): boolean {
    var Dir1 =
      op1.Pt.X > op1b.Pt.X ? Direction.dRightToLeft : Direction.dLeftToRight;
    var Dir2 =
      op2.Pt.X > op2b.Pt.X ? Direction.dRightToLeft : Direction.dLeftToRight;
    if (Dir1 == Dir2) return false;
    //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
    //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
    //So, to facilitate this while inserting Op1b and Op2b ...
    //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
    //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
    if (Dir1 == Direction.dLeftToRight) {
      while (
        op1.Next.Pt.X <= Pt.X &&
        op1.Next.Pt.X >= op1.Pt.X &&
        op1.Next.Pt.Y == Pt.Y
      )
        op1 = op1.Next;
      if (DiscardLeft && op1.Pt.X != Pt.X) op1 = op1.Next;
      op1b = this.DupOutPt(op1, !DiscardLeft);
      if (IntPoint.op_Inequality(op1b.Pt, Pt)) {
        op1 = op1b;
        //op1.Pt = Pt;
        op1.Pt.X = Pt.X;
        op1.Pt.Y = Pt.Y;
        op1b = this.DupOutPt(op1, !DiscardLeft);
      }
    } else {
      while (
        op1.Next.Pt.X >= Pt.X &&
        op1.Next.Pt.X <= op1.Pt.X &&
        op1.Next.Pt.Y == Pt.Y
      )
        op1 = op1.Next;
      if (!DiscardLeft && op1.Pt.X != Pt.X) op1 = op1.Next;
      op1b = this.DupOutPt(op1, DiscardLeft);
      if (IntPoint.op_Inequality(op1b.Pt, Pt)) {
        op1 = op1b;
        //op1.Pt = Pt;
        op1.Pt.X = Pt.X;
        op1.Pt.Y = Pt.Y;
        op1b = this.DupOutPt(op1, DiscardLeft);
      }
    }
    if (Dir2 == Direction.dLeftToRight) {
      while (
        op2.Next.Pt.X <= Pt.X &&
        op2.Next.Pt.X >= op2.Pt.X &&
        op2.Next.Pt.Y == Pt.Y
      )
        op2 = op2.Next;
      if (DiscardLeft && op2.Pt.X != Pt.X) op2 = op2.Next;
      op2b = this.DupOutPt(op2, !DiscardLeft);
      if (IntPoint.op_Inequality(op2b.Pt, Pt)) {
        op2 = op2b;
        //op2.Pt = Pt;
        op2.Pt.X = Pt.X;
        op2.Pt.Y = Pt.Y;
        op2b = this.DupOutPt(op2, !DiscardLeft);
      }
    } else {
      while (
        op2.Next.Pt.X >= Pt.X &&
        op2.Next.Pt.X <= op2.Pt.X &&
        op2.Next.Pt.Y == Pt.Y
      )
        op2 = op2.Next;
      if (!DiscardLeft && op2.Pt.X != Pt.X) op2 = op2.Next;
      op2b = this.DupOutPt(op2, DiscardLeft);
      if (IntPoint.op_Inequality(op2b.Pt, Pt)) {
        op2 = op2b;
        //op2.Pt = Pt;
        op2.Pt.X = Pt.X;
        op2.Pt.Y = Pt.Y;
        op2b = this.DupOutPt(op2, DiscardLeft);
      }
    }
    if ((Dir1 == Direction.dLeftToRight) == DiscardLeft) {
      op1.Prev = op2;
      op2.Next = op1;
      op1b.Next = op2b;
      op2b.Prev = op1b;
    } else {
      op1.Next = op2;
      op2.Prev = op1;
      op1b.Prev = op2b;
      op2b.Next = op1b;
    }
    return true;
  }

  public GetOverlap(
    a1: number,
    a2: number,
    b1: number,
    b2: number,
    $val: { Left: number; Right: number }
  ): boolean {
    if (a1 < a2) {
      if (b1 < b2) {
        $val.Left = Math.max(a1, b1);
        $val.Right = Math.min(a2, b2);
      } else {
        $val.Left = Math.max(a1, b2);
        $val.Right = Math.min(a2, b1);
      }
    } else {
      if (b1 < b2) {
        $val.Left = Math.max(a2, b1);
        $val.Right = Math.min(a1, b2);
      } else {
        $val.Left = Math.max(a2, b2);
        $val.Right = Math.min(a1, b1);
      }
    }
    return $val.Left < $val.Right;
  }

  public JoinPoints(j: Join, outRec1: OutRec, outRec2: OutRec) {
    var op1 = j.OutPt1,
      op1b = new OutPt();
    var op2 = j.OutPt2,
      op2b = new OutPt();
    //There are 3 kinds of joins for output polygons ...
    //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
    //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
    //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
    //location at the Bottom of the overlapping segment (& Join.OffPt is above).
    //3. StrictlySimple joins where edges touch but are not collinear and where
    //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
    var isHorizontal = j.OutPt1.Pt.Y == j.OffPt.Y;
    if (
      isHorizontal &&
      IntPoint.op_Equality(j.OffPt, j.OutPt1.Pt) &&
      IntPoint.op_Equality(j.OffPt, j.OutPt2.Pt)
    ) {
      //Strictly Simple join ...
      op1b = j.OutPt1.Next;
      while (op1b != op1 && IntPoint.op_Equality(op1b.Pt, j.OffPt))
        op1b = op1b.Next;
      var reverse1 = op1b.Pt.Y > j.OffPt.Y;
      op2b = j.OutPt2.Next;
      while (op2b != op2 && IntPoint.op_Equality(op2b.Pt, j.OffPt))
        op2b = op2b.Next;
      var reverse2 = op2b.Pt.Y > j.OffPt.Y;
      if (reverse1 == reverse2) return false;
      if (reverse1) {
        op1b = this.DupOutPt(op1, false);
        op2b = this.DupOutPt(op2, true);
        op1.Prev = op2;
        op2.Next = op1;
        op1b.Next = op2b;
        op2b.Prev = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      } else {
        op1b = this.DupOutPt(op1, true);
        op2b = this.DupOutPt(op2, false);
        op1.Next = op2;
        op2.Prev = op1;
        op1b.Prev = op2b;
        op2b.Next = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      }
    } else if (isHorizontal) {
      //treat horizontal joins differently to non-horizontal joins since with
      //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
      //may be anywhere along the horizontal edge.
      op1b = op1;
      while (op1.Prev.Pt.Y == op1.Pt.Y && op1.Prev != op1b && op1.Prev != op2)
        op1 = op1.Prev;
      while (
        op1b.Next.Pt.Y == op1b.Pt.Y &&
        op1b.Next != op1 &&
        op1b.Next != op2
      )
        op1b = op1b.Next;
      if (op1b.Next == op1 || op1b.Next == op2) return false;
      //a flat 'polygon'
      op2b = op2;
      while (op2.Prev.Pt.Y == op2.Pt.Y && op2.Prev != op2b && op2.Prev != op1b)
        op2 = op2.Prev;
      while (
        op2b.Next.Pt.Y == op2b.Pt.Y &&
        op2b.Next != op2 &&
        op2b.Next != op1
      )
        op2b = op2b.Next;
      if (op2b.Next == op2 || op2b.Next == op1) return false;
      //a flat 'polygon'
      //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

      var $val: { Left: number; Right: number } = { Left: null, Right: null };
      if (!this.GetOverlap(op1.Pt.X, op1b.Pt.X, op2.Pt.X, op2b.Pt.X, $val))
        return false;
      var Left = $val.Left;
      var Right = $val.Right;

      //DiscardLeftSide: when overlapping edges are joined, a spike will created
      //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
      //on the discard Side as either may still be needed for other joins ...
      var Pt = new IntPoint();
      var DiscardLeftSide;
      if (op1.Pt.X >= Left && op1.Pt.X <= Right) {
        //Pt = op1.Pt;
        Pt.X = op1.Pt.X;
        Pt.Y = op1.Pt.Y;
        DiscardLeftSide = op1.Pt.X > op1b.Pt.X;
      } else if (op2.Pt.X >= Left && op2.Pt.X <= Right) {
        //Pt = op2.Pt;
        Pt.X = op2.Pt.X;
        Pt.Y = op2.Pt.Y;
        DiscardLeftSide = op2.Pt.X > op2b.Pt.X;
      } else if (op1b.Pt.X >= Left && op1b.Pt.X <= Right) {
        //Pt = op1b.Pt;
        Pt.X = op1b.Pt.X;
        Pt.Y = op1b.Pt.Y;
        DiscardLeftSide = op1b.Pt.X > op1.Pt.X;
      } else {
        //Pt = op2b.Pt;
        Pt.X = op2b.Pt.X;
        Pt.Y = op2b.Pt.Y;
        DiscardLeftSide = op2b.Pt.X > op2.Pt.X;
      }
      j.OutPt1 = op1;
      j.OutPt2 = op2;
      return this.JoinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
    } else {
      //nb: For non-horizontal joins ...
      //    1. Jr.OutPt1.Pt.Y == Jr.OutPt2.Pt.Y
      //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
      //make sure the polygons are correctly oriented ...
      op1b = op1.Next;
      while (IntPoint.op_Equality(op1b.Pt, op1.Pt) && op1b != op1)
        op1b = op1b.Next;
      var Reverse1 =
        op1b.Pt.Y > op1.Pt.Y ||
        !Clipper.SlopesEqual(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange);
      if (Reverse1) {
        op1b = op1.Prev;
        while (IntPoint.op_Equality(op1b.Pt, op1.Pt) && op1b != op1)
          op1b = op1b.Prev;
        if (
          op1b.Pt.Y > op1.Pt.Y ||
          !Clipper.SlopesEqual(op1.Pt, op1b.Pt, j.OffPt, this.m_UseFullRange)
        )
          return false;
      }
      op2b = op2.Next;
      while (IntPoint.op_Equality(op2b.Pt, op2.Pt) && op2b != op2)
        op2b = op2b.Next;
      var Reverse2 =
        op2b.Pt.Y > op2.Pt.Y ||
        !Clipper.SlopesEqual(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange);
      if (Reverse2) {
        op2b = op2.Prev;
        while (IntPoint.op_Equality(op2b.Pt, op2.Pt) && op2b != op2)
          op2b = op2b.Prev;
        if (
          op2b.Pt.Y > op2.Pt.Y ||
          !Clipper.SlopesEqual(op2.Pt, op2b.Pt, j.OffPt, this.m_UseFullRange)
        )
          return false;
      }
      if (
        op1b == op1 ||
        op2b == op2 ||
        op1b == op2b ||
        (outRec1 == outRec2 && Reverse1 == Reverse2)
      )
        return false;
      if (Reverse1) {
        op1b = this.DupOutPt(op1, false);
        op2b = this.DupOutPt(op2, true);
        op1.Prev = op2;
        op2.Next = op1;
        op1b.Next = op2b;
        op2b.Prev = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      } else {
        op1b = this.DupOutPt(op1, true);
        op2b = this.DupOutPt(op2, false);
        op1.Next = op2;
        op2.Prev = op1;
        op1b.Prev = op2b;
        op2b.Next = op1b;
        j.OutPt1 = op1;
        j.OutPt2 = op1b;
        return true;
      }
    }
  }

  public JoinCommonEdges() {
    for (var i = 0, ilen = this.m_Joins.length; i < ilen; i++) {
      var join = this.m_Joins[i];
      var outRec1 = this.GetOutRec(join.OutPt1.Idx);
      var outRec2 = this.GetOutRec(join.OutPt2.Idx);
      if (outRec1.Pts == null || outRec2.Pts == null) continue;
      //get the polygon fragment with the correct hole state (FirstLeft)
      //before calling JoinPoints() ...
      var holeStateRec;
      if (outRec1 == outRec2) holeStateRec = outRec1;
      else if (this.Param1RightOfParam2(outRec1, outRec2))
        holeStateRec = outRec2;
      else if (this.Param1RightOfParam2(outRec2, outRec1))
        holeStateRec = outRec1;
      else holeStateRec = this.GetLowermostRec(outRec1, outRec2);

      if (!this.JoinPoints(join, outRec1, outRec2)) continue;

      if (outRec1 == outRec2) {
        //instead of joining two polygons, we've just created a new one by
        //splitting one polygon into two.
        outRec1.Pts = join.OutPt1;
        outRec1.BottomPt = null;
        outRec2 = this.CreateOutRec();
        outRec2.Pts = join.OutPt2;
        //update all OutRec2.Pts Idx's ...
        this.UpdateOutPtIdxs(outRec2);
        //We now need to check every OutRec.FirstLeft pointer. If it points
        //to OutRec1 it may need to point to OutRec2 instead ...
        if (this.m_UsingPolyTree)
          for (var j = 0, jlen = this.m_PolyOuts.length; j < jlen - 1; j++) {
            var oRec = this.m_PolyOuts[j];
            if (
              oRec.Pts == null ||
              Clipper.ParseFirstLeft(oRec.FirstLeft) != outRec1 ||
              oRec.IsHole == outRec1.IsHole
            )
              continue;
            if (this.Poly2ContainsPoly1(oRec.Pts, join.OutPt2))
              oRec.FirstLeft = outRec2;
          }
        if (this.Poly2ContainsPoly1(outRec2.Pts, outRec1.Pts)) {
          //outRec2 is contained by outRec1 ...
          outRec2.IsHole = !outRec1.IsHole;
          outRec2.FirstLeft = outRec1;
          //fixup FirstLeft pointers that may need reassigning to OutRec1
          if (this.m_UsingPolyTree) this.FixupFirstLefts2(outRec2, outRec1);
          //@ts-ignore
          if ((outRec2.IsHole ^ this.ReverseSolution) == this.Area(outRec2) > 0)
            this.ReversePolyPtLinks(outRec2.Pts);
        } else if (this.Poly2ContainsPoly1(outRec1.Pts, outRec2.Pts)) {
          //outRec1 is contained by outRec2 ...
          outRec2.IsHole = outRec1.IsHole;
          outRec1.IsHole = !outRec2.IsHole;
          outRec2.FirstLeft = outRec1.FirstLeft;
          outRec1.FirstLeft = outRec2;
          //fixup FirstLeft pointers that may need reassigning to OutRec1
          if (this.m_UsingPolyTree) this.FixupFirstLefts2(outRec1, outRec2);
          //@ts-ignore
          if ((outRec1.IsHole ^ this.ReverseSolution) == this.Area(outRec1) > 0)
            this.ReversePolyPtLinks(outRec1.Pts);
        } else {
          //the 2 polygons are completely separate ...
          outRec2.IsHole = outRec1.IsHole;
          outRec2.FirstLeft = outRec1.FirstLeft;
          //fixup FirstLeft pointers that may need reassigning to OutRec2
          if (this.m_UsingPolyTree) this.FixupFirstLefts1(outRec1, outRec2);
        }
      } else {
        //joined 2 polygons together ...
        outRec2.Pts = null;
        outRec2.BottomPt = null;
        outRec2.Idx = outRec1.Idx;
        outRec1.IsHole = holeStateRec.IsHole;
        if (holeStateRec == outRec2) outRec1.FirstLeft = outRec2.FirstLeft;
        outRec2.FirstLeft = outRec1;
        //fixup FirstLeft pointers that may need reassigning to OutRec1
        if (this.m_UsingPolyTree) this.FixupFirstLefts2(outRec2, outRec1);
      }
    }
  }

  public ReversePolyPtLinks(pp: OutPt): void {
    if (pp === null) return;
    var pp1;
    var pp2;
    pp1 = pp;
    do {
      pp2 = pp1.Next;
      pp1.Next = pp1.Prev;
      pp1.Prev = pp2;
      pp1 = pp2;
    } while (pp1 != pp);
  }

  public FixupFirstLefts1(OldOutRec: OutRec, NewOutRec: OutRec): void {
    for (var i = 0, ilen = this.m_PolyOuts.length; i < ilen; i++) {
      var outRec = this.m_PolyOuts[i];
      if (outRec.Pts !== null && outRec.FirstLeft == OldOutRec) {
        if (this.Poly2ContainsPoly1(outRec.Pts, NewOutRec.Pts))
          outRec.FirstLeft = NewOutRec;
      }
    }
  }
  public FixupFirstLefts2(OldOutRec: OutRec, NewOutRec: OutRec): void {
    for (
      var $i2 = 0, $t2 = this.m_PolyOuts, $l2 = $t2.length, outRec = $t2[$i2];
      $i2 < $l2;
      $i2++, outRec = $t2[$i2]
    )
      if (outRec.FirstLeft == OldOutRec) outRec.FirstLeft = NewOutRec;
  }

  public ProcessHorizontals(isTopOfScanbeam: boolean): void {
    var horzEdge = this.m_SortedEdges;
    while (horzEdge !== null) {
      this.DeleteFromSEL(horzEdge);
      this.ProcessHorizontal(horzEdge, isTopOfScanbeam);
      horzEdge = this.m_SortedEdges;
    }
  }

  public DeleteFromSEL(e: TEdge): void {
    var SelPrev = e.PrevInSEL;
    var SelNext = e.NextInSEL;
    if (SelPrev === null && SelNext === null && e != this.m_SortedEdges) return;
    //already deleted
    if (SelPrev !== null) SelPrev.NextInSEL = SelNext;
    else this.m_SortedEdges = SelNext;
    if (SelNext !== null) SelNext.PrevInSEL = SelPrev;
    e.NextInSEL = null;
    e.PrevInSEL = null;
  }

  public PopScanbeam(): number {
    var Y = this.m_Scanbeam.Y;
    this.m_Scanbeam = this.m_Scanbeam.Next;
    return Y;
  }

  public DoSimplePolygons() {
    var i = 0;
    while (i < this.m_PolyOuts.length) {
      var outrec = this.m_PolyOuts[i++];
      var op = outrec.Pts;
      if (op === null) continue;
      do //for each Pt in Polygon until duplicate found do ...
      {
        var op2 = op.Next;
        while (op2 != outrec.Pts) {
          if (
            IntPoint.op_Equality(op.Pt, op2.Pt) &&
            op2.Next != op &&
            op2.Prev != op
          ) {
            //split the polygon into two ...
            var op3 = op.Prev;
            var op4 = op2.Prev;
            op.Prev = op4;
            op4.Next = op;
            op2.Prev = op3;
            op3.Next = op2;
            outrec.Pts = op;
            var outrec2 = this.CreateOutRec();
            outrec2.Pts = op2;
            this.UpdateOutPtIdxs(outrec2);
            if (this.Poly2ContainsPoly1(outrec2.Pts, outrec.Pts)) {
              //OutRec2 is contained by OutRec1 ...
              outrec2.IsHole = !outrec.IsHole;
              outrec2.FirstLeft = outrec;
            } else if (this.Poly2ContainsPoly1(outrec.Pts, outrec2.Pts)) {
              //OutRec1 is contained by OutRec2 ...
              outrec2.IsHole = outrec.IsHole;
              outrec.IsHole = !outrec2.IsHole;
              outrec2.FirstLeft = outrec.FirstLeft;
              outrec.FirstLeft = outrec2;
            } else {
              //the 2 polygons are separate ...
              outrec2.IsHole = outrec.IsHole;
              outrec2.FirstLeft = outrec.FirstLeft;
            }
            op2 = op;
            //ie get ready for the next iteration
          }
          op2 = op2.Next;
        }
        op = op.Next;
      } while (op != outrec.Pts);
    }
  }

  public UpdateOutPtIdxs(outrec: OutRec): void {
    var op = outrec.Pts;
    do {
      op.Idx = outrec.Idx;
      op = op.Prev;
    } while (op != outrec.Pts);
  }

  public PointInPolygon(pt: IntPoint, path: IntPoint[]) {
    //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
    //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
    var result = 0,
      cnt = path.length;
    if (cnt < 3) return 0;
    var ip = path[0];
    for (var i = 1; i <= cnt; ++i) {
      var ipNext = i == cnt ? path[0] : path[i];
      if (ipNext.Y == pt.Y) {
        if (
          ipNext.X == pt.X ||
          (ip.Y == pt.Y && ipNext.X > pt.X == ip.X < pt.X)
        )
          return -1;
      }
      if (ip.Y < pt.Y != ipNext.Y < pt.Y) {
        if (ip.X >= pt.X) {
          if (ipNext.X > pt.X) result = 1 - result;
          else {
            var d =
              (ip.X - pt.X) * (ipNext.Y - pt.Y) -
              (ipNext.X - pt.X) * (ip.Y - pt.Y);
            if (d == 0) return -1;
            else if (d > 0 == ipNext.Y > ip.Y) result = 1 - result;
          }
        } else {
          if (ipNext.X > pt.X) {
            var d =
              (ip.X - pt.X) * (ipNext.Y - pt.Y) -
              (ipNext.X - pt.X) * (ip.Y - pt.Y);
            if (d == 0) return -1;
            else if (d > 0 == ipNext.Y > ip.Y) result = 1 - result;
          }
        }
      }
      ip = ipNext;
    }
    return result;
  }

  public Poly2ContainsPoly1(outPt1: any, outPt2: any): boolean {
    var op = outPt1;
    do {
      var res = this.PointInPolygon(op.Pt, outPt2);
      if (res >= 0) return res != 0;
      op = op.Next;
    } while (op != outPt1);
    return true;
  }

  public CreateOutRec(): OutRec {
    var result = new OutRec();
    result.Idx = -1;
    result.IsHole = false;
    result.IsOpen = false;
    result.FirstLeft = null;
    result.Pts = null;
    result.BottomPt = null;
    result.PolyNode = null;
    this.m_PolyOuts.push(result);
    result.Idx = this.m_PolyOuts.length - 1;
    return result;
  }

  public Reset() {
    this.m_CurrentLM = this.m_MinimaList;
    if (this.m_CurrentLM == null) return;
    //ie nothing to process
    //reset all edges ...
    var lm = this.m_MinimaList;
    while (lm != null) {
      var e = lm.LeftBound;
      if (e != null) {
        //e.Curr = e.Bot;
        e.Curr.X = e.Bot.X;
        e.Curr.Y = e.Bot.Y;
        e.Side = EdgeSide.esLeft;
        e.OutIdx = Clipper.Unassigned;
      }
      e = lm.RightBound;
      if (e != null) {
        //e.Curr = e.Bot;
        e.Curr.X = e.Bot.X;
        e.Curr.Y = e.Bot.Y;
        e.Side = EdgeSide.esRight;
        e.OutIdx = Clipper.Unassigned;
      }
      lm = lm.Next;
    }

    this.m_Scanbeam = null;
    this.m_ActiveEdges = null;
    this.m_SortedEdges = null;

    var lm = this.m_MinimaList;
    while (lm !== null) {
      this.InsertScanbeam(lm.Y);
      lm = lm.Next;
    }
  }

  public InsertScanbeam(Y: number) {
    if (this.m_Scanbeam === null) {
      this.m_Scanbeam = new Scanbeam();
      this.m_Scanbeam.Next = null;
      this.m_Scanbeam.Y = Y;
    } else if (Y > this.m_Scanbeam.Y) {
      var newSb = new Scanbeam();
      newSb.Y = Y;
      newSb.Next = this.m_Scanbeam;
      this.m_Scanbeam = newSb;
    } else {
      var sb2 = this.m_Scanbeam;
      while (sb2.Next !== null && Y <= sb2.Next.Y) sb2 = sb2.Next;
      if (Y == sb2.Y) return;
      //ie ignores duplicates
      var newSb = new Scanbeam();
      newSb.Y = Y;
      newSb.Next = sb2.Next;
      sb2.Next = newSb;
    }
  }

  public GetNextInAEL(e: TEdge, direction: Direction) {
    return direction == Direction.dLeftToRight ? e.NextInAEL : e.PrevInAEL;
  }

  public UpdateEdgeIntoAEL(e: TEdge) {
    if (e.NextInLML === null) console.error("UpdateEdgeIntoAEL: invalid call");
    var AelPrev = e.PrevInAEL;
    var AelNext = e.NextInAEL;
    e.NextInLML.OutIdx = e.OutIdx;
    if (AelPrev !== null) AelPrev.NextInAEL = e.NextInLML;
    else this.m_ActiveEdges = e.NextInLML;
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
    if (!Clipper.IsHorizontal(e)) this.InsertScanbeam(e.Top.Y);
    return e;
  }

  public GetMaximaPair(e: TEdge): TEdge {
    var result = null;
    if (IntPoint.op_Equality(e.Next.Top, e.Top) && e.Next.NextInLML === null)
      result = e.Next;
    else if (
      IntPoint.op_Equality(e.Prev.Top, e.Top) &&
      e.Prev.NextInLML === null
    )
      result = e.Prev;
    if (
      result !== null &&
      (result.OutIdx == -2 ||
        (result.NextInAEL == result.PrevInAEL && !Clipper.IsHorizontal(result)))
    )
      return null;
    return result;
  }

  public ProcessHorizontal(horzEdge: TEdge, isTopOfScanbeam: boolean) {
    var $var: DirData = { Dir: null, Left: null, Right: null };
    this.GetHorzDirection(horzEdge, $var);
    var dir = $var.Dir;
    var horzLeft = $var.Left;
    var horzRight = $var.Right;

    var eLastHorz = horzEdge,
      eMaxPair = null;
    while (
      eLastHorz.NextInLML !== null &&
      Clipper.IsHorizontal(eLastHorz.NextInLML)
    )
      eLastHorz = eLastHorz.NextInLML;
    if (eLastHorz.NextInLML === null) eMaxPair = this.GetMaximaPair(eLastHorz);
    for (;;) {
      var IsLastHorz = horzEdge == eLastHorz;
      var e = this.GetNextInAEL(horzEdge, dir);
      while (e !== null) {
        //Break if we've got to the end of an intermediate horizontal edge ...
        //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
        if (
          e.Curr.X == horzEdge.Top.X &&
          horzEdge.NextInLML !== null &&
          e.Dx < horzEdge.NextInLML.Dx
        )
          break;
        var eNext = this.GetNextInAEL(e, dir);
        //saves eNext for later
        if (
          (dir == Direction.dLeftToRight && e.Curr.X <= horzRight) ||
          (dir == Direction.dRightToLeft && e.Curr.X >= horzLeft)
        ) {
          if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta != 0)
            this.PrepareHorzJoins(horzEdge, isTopOfScanbeam);

          //so far we're still in range of the horizontal Edge  but make sure
          //we're at the last of consec. horizontals when matching with eMaxPair
          if (e == eMaxPair && IsLastHorz) {
            if (dir == Direction.dLeftToRight)
              this.IntersectEdges(horzEdge, e, e.Top, false);
            else this.IntersectEdges(e, horzEdge, e.Top, false);
            if (eMaxPair.OutIdx >= 0) console.error("ProcessHorizontal error");
            return;
          } else if (dir == Direction.dLeftToRight) {
            var Pt = new IntPoint(e.Curr.X, horzEdge.Curr.Y);
            this.IntersectEdges(horzEdge, e, Pt, true);
          } else {
            var Pt = new IntPoint(e.Curr.X, horzEdge.Curr.Y);
            this.IntersectEdges(e, horzEdge, Pt, true);
          }
          this.SwapPositionsInAEL(horzEdge, e);
        } else if (
          (dir == Direction.dLeftToRight && e.Curr.X >= horzRight) ||
          (dir == Direction.dRightToLeft && e.Curr.X <= horzLeft)
        )
          break;
        e = eNext;
      }
      //end while
      if (horzEdge.OutIdx >= 0 && horzEdge.WindDelta !== 0)
        this.PrepareHorzJoins(horzEdge, isTopOfScanbeam);
      if (
        horzEdge.NextInLML !== null &&
        Clipper.IsHorizontal(horzEdge.NextInLML)
      ) {
        horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
        if (horzEdge.OutIdx >= 0) this.AddOutPt(horzEdge, horzEdge.Bot);

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
        var op1 = this.AddOutPt(horzEdge, horzEdge.Top);
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
          Clipper.SlopesEqualEdge(horzEdge, ePrev, this.m_UseFullRange)
        ) {
          var op2 = this.AddOutPt(ePrev, horzEdge.Bot);
          this.AddJoin(op1, op2, horzEdge.Top);
        } else if (
          eNext !== null &&
          eNext.Curr.X == horzEdge.Bot.X &&
          eNext.Curr.Y == horzEdge.Bot.Y &&
          eNext.WindDelta !== 0 &&
          eNext.OutIdx >= 0 &&
          eNext.Curr.Y > eNext.Top.Y &&
          Clipper.SlopesEqualEdge(horzEdge, eNext, this.m_UseFullRange)
        ) {
          var op2 = this.AddOutPt(eNext, horzEdge.Bot);
          this.AddJoin(op1, op2, horzEdge.Top);
        }
      } else horzEdge = this.UpdateEdgeIntoAEL(horzEdge);
    } else if (eMaxPair !== null) {
      if (eMaxPair.OutIdx >= 0) {
        if (dir == Direction.dLeftToRight)
          this.IntersectEdges(horzEdge, eMaxPair, horzEdge.Top, false);
        else this.IntersectEdges(eMaxPair, horzEdge, horzEdge.Top, false);
        if (eMaxPair.OutIdx >= 0) console.error("ProcessHorizontal error");
      } else {
        this.DeleteFromAEL(horzEdge);
        this.DeleteFromAEL(eMaxPair);
      }
    } else {
      if (horzEdge.OutIdx >= 0) this.AddOutPt(horzEdge, horzEdge.Top);
      this.DeleteFromAEL(horzEdge);
    }
  }

  public GetHorzDirection(HorzEdge: TEdge, $var: DirData): void {
    if (HorzEdge.Bot.X < HorzEdge.Top.X) {
      $var.Left = HorzEdge.Bot.X;
      $var.Right = HorzEdge.Top.X;
      $var.Dir = Direction.dLeftToRight;
    } else {
      $var.Left = HorzEdge.Top.X;
      $var.Right = HorzEdge.Bot.X;
      $var.Dir = Direction.dRightToLeft;
    }
  }

  public SetHoleState(e: TEdge, outRec: OutRec): void {
    var isHole = false;
    var e2 = e.PrevInAEL;
    while (e2 !== null) {
      if (e2.OutIdx >= 0 && e2.WindDelta != 0) {
        isHole = !isHole;
        if (outRec.FirstLeft === null)
          outRec.FirstLeft = this.m_PolyOuts[e2.OutIdx];
      }
      e2 = e2.PrevInAEL;
    }
    if (isHole) outRec.IsHole = true;
  }

  public AddOutPt(e: TEdge, pt: IntPoint) {
    var ToFront = e.Side == EdgeSide.esLeft;
    if (e.OutIdx < 0) {
      var outRec: OutRec = this.CreateOutRec();
      outRec.IsOpen = e.WindDelta === 0;
      var newOp: OutPt = new OutPt();
      outRec.Pts = newOp;
      newOp.Idx = outRec.Idx;
      //newOp.Pt = pt;
      newOp.Pt.X = pt.X;
      newOp.Pt.Y = pt.Y;
      newOp.Next = newOp;
      newOp.Prev = newOp;
      if (!outRec.IsOpen) this.SetHoleState(e, outRec);
      e.OutIdx = outRec.Idx;
      //nb: do this after SetZ !
      return newOp;
    } else {
      var outRec = this.m_PolyOuts[e.OutIdx];
      //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
      var op = outRec.Pts;
      if (ToFront && IntPoint.op_Equality(pt, op.Pt)) return op;
      else if (!ToFront && IntPoint.op_Equality(pt, op.Prev.Pt)) return op.Prev;
      var newOp = new OutPt();
      newOp.Idx = outRec.Idx;
      //newOp.Pt = pt;
      newOp.Pt.X = pt.X;
      newOp.Pt.Y = pt.Y;
      newOp.Next = op;
      newOp.Prev = op.Prev;
      newOp.Prev.Next = newOp;
      op.Prev = newOp;
      if (ToFront) outRec.Pts = newOp;

      return newOp;
    }
  }
  public PrepareHorzJoins(horzEdge: TEdge, isTopOfScanbeam: boolean) {
    //get the last Op for this horizontal edge
    //the point may be anywhere along the horizontal ...
    var outPt = this.m_PolyOuts[horzEdge.OutIdx].Pts;
    if (horzEdge.Side != EdgeSide.esLeft) outPt = outPt.Prev;
    //First, match up overlapping horizontal edges (eg when one polygon's
    //intermediate horz edge overlaps an intermediate horz edge of another, or
    //when one polygon sits on top of another) ...
    //for (var i = 0, ilen = this.m_GhostJoins.length; i < ilen; ++i) {
    //  var j = this.m_GhostJoins[i];
    //  if (this.HorzSegmentsOverlap(j.OutPt1.Pt, j.OffPt, horzEdge.Bot, horzEdge.Top))
    //    this.AddJoin(j.OutPt1, outPt, j.OffPt);
    //}

    //Also, since horizontal edges at the top of one SB are often removed from
    //the AEL before we process the horizontal edges at the bottom of the next,
    //we need to create 'ghost' Join records of 'contrubuting' horizontals that
    //we can compare with horizontals at the bottom of the next SB.
    if (isTopOfScanbeam)
      if (IntPoint.op_Equality(outPt.Pt, horzEdge.Top))
        this.AddGhostJoin(outPt, horzEdge.Bot);
      else this.AddGhostJoin(outPt, horzEdge.Top);
  }

  public AddGhostJoin(Op: OutPt, OffPt: IntPoint): void {
    var j = new Join();
    j.OutPt1 = Op;
    //j.OffPt = OffPt;
    j.OffPt.X = OffPt.X;
    j.OffPt.Y = OffPt.Y;
    this.m_GhostJoins.push(j);
  }

  public DeleteFromAEL(e: TEdge): void {
    var AelPrev = e.PrevInAEL;
    var AelNext = e.NextInAEL;
    if (AelPrev === null && AelNext === null && e != this.m_ActiveEdges) return;
    //already deleted
    if (AelPrev !== null) AelPrev.NextInAEL = AelNext;
    else this.m_ActiveEdges = AelNext;
    if (AelNext !== null) AelNext.PrevInAEL = AelPrev;
    e.NextInAEL = null;
    e.PrevInAEL = null;
  }

  private m_IntersectNodeComparer(node1: any, node2: any): number {
    return node2.Pt.Y - node1.Pt.Y;
  }

  public static SlopesEqual(
    pt1: IntPoint,
    pt2: IntPoint,
    pt3: IntPoint,
    UseFullRange: boolean = false
  ): boolean {
    // function (pt1, pt2, pt3, UseFullRange)
    if (UseFullRange)
      return Int128.op_Equality(
        Int128.Int128Mul(pt1.Y - pt2.Y, pt2.X - pt3.X),
        Int128.Int128Mul(pt1.X - pt2.X, pt2.Y - pt3.Y)
      );
    else
      return (
        Clipper.Cast_Int64((pt1.Y - pt2.Y) * (pt2.X - pt3.X)) -
          Clipper.Cast_Int64((pt1.X - pt2.X) * (pt2.Y - pt3.Y)) ===
        0
      );
  }

  public static Cast_Int64(a: number): number {
    if (a < -2147483648 || a > 2147483647)
      return a < 0 ? Math.ceil(a) : Math.floor(a);
    else return ~~a;
  }

  public static Clear(a: any[]) {
    a.length = 0;
  }

  public FixupOutPolygon(outRec: OutRec) {
    //FixupOutPolygon() - removes duplicate points and simplifies consecutive
    //parallel edges by removing the middle vertex.
    var lastOK = null;
    outRec.BottomPt = null;
    var pp = outRec.Pts;
    for (;;) {
      if (pp.Prev == pp || pp.Prev == pp.Next) {
        this.DisposeOutPts(pp);
        outRec.Pts = null;
        return;
      }
      //test for duplicate points and collinear edges ...
      if (
        IntPoint.op_Equality(pp.Pt, pp.Next.Pt) ||
        IntPoint.op_Equality(pp.Pt, pp.Prev.Pt) ||
        (Clipper.SlopesEqual(
          pp.Prev.Pt,
          pp.Pt,
          pp.Next.Pt,
          this.m_UseFullRange
        ) &&
          (!this.PreserveCollinear ||
            !this.Pt2IsBetweenPt1AndPt3(pp.Prev.Pt, pp.Pt, pp.Next.Pt)))
      ) {
        lastOK = null;
        var tmp = pp;
        pp.Prev.Next = pp.Next;
        pp.Next.Prev = pp.Prev;
        pp = pp.Prev;
        tmp = null;
      } else if (pp == lastOK) break;
      else {
        if (lastOK === null) lastOK = pp;
        pp = pp.Next;
      }
    }
    outRec.Pts = pp;
  }

  public static IsHorizontal(e: TEdge) {
    return e.Delta.Y === 0;
  }

  static ParseFirstLeft(FirstLeft: OutRec) {
    while (FirstLeft != null && FirstLeft.Pts == null)
      FirstLeft = FirstLeft.FirstLeft;
    return FirstLeft;
  }

  public static SlopesEqualEdge(e1: TEdge, e2: TEdge, UseFullRange: boolean) {
    if (UseFullRange)
      return Int128.op_Equality(
        Int128.Int128Mul(e1.Delta.Y, e2.Delta.X),
        Int128.Int128Mul(e1.Delta.X, e2.Delta.Y)
      );
    else
      return (
        Clipper.Cast_Int64(e1.Delta.Y * e2.Delta.X) ==
        Clipper.Cast_Int64(e1.Delta.X * e2.Delta.Y)
      );
  }

  public static Round(value: number): number {
    return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
  }

  public static TopX(edge: TEdge, currentY: number): number {
    //if (edge.Bot == edge.Curr) alert ("edge.Bot = edge.Curr");
    //if (edge.Bot == edge.Top) alert ("edge.Bot = edge.Top");
    if (currentY == edge.Top.Y) return edge.Top.X;
    return edge.Bot.X + Clipper.Round(edge.Dx * (currentY - edge.Bot.Y));
  }

  public static ExcludeOp(op: OutPt): OutPt {
    var result = op.Prev;
    result.Next = op.Next;
    op.Next.Prev = result;
    result.Idx = 0;
    return result;
  }

  public static PointsAreClose(
    pt1: IntPoint,
    pt2: IntPoint,
    distSqrd: number
  ): boolean {
    var dx = pt1.X - pt2.X;
    var dy = pt1.Y - pt2.Y;
    return dx * dx + dy * dy <= distSqrd;
  }

  public static DistanceFromLineSqrd(
    pt: IntPoint,
    ln1: IntPoint,
    ln2: IntPoint
  ): number {
    //The equation of a line in general form (Ax + By + C = 0)
    //given 2 points (x�,y�) & (x�,y�) is ...
    //(y� - y�)x + (x� - x�)y + (y� - y�)x� - (x� - x�)y� = 0
    //A = (y� - y�); B = (x� - x�); C = (y� - y�)x� - (x� - x�)y�
    //perpendicular distance of point (x�,y�) = (Ax� + By� + C)/Sqrt(A� + B�)
    //see http://en.wikipedia.org/wiki/Perpendicular_distance
    var A = ln1.Y - ln2.Y;
    var B = ln2.X - ln1.X;
    var C = A * ln1.X + B * ln1.Y;
    C = A * pt.X + B * pt.Y - C;
    return (C * C) / (A * A + B * B);
  }

  public static SlopesNearCollinear(
    pt1: IntPoint,
    pt2: IntPoint,
    pt3: IntPoint,
    distSqrd: number
  ): boolean {
    return Clipper.DistanceFromLineSqrd(pt2, pt1, pt3) < distSqrd;
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
    var outPts = new Array(cnt);
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
      if (Clipper.PointsAreClose(op.Pt, op.Prev.Pt, distSqrd)) {
        op = Clipper.ExcludeOp(op);
        cnt--;
      } else if (Clipper.PointsAreClose(op.Prev.Pt, op.Next.Pt, distSqrd)) {
        Clipper.ExcludeOp(op.Next);
        op = Clipper.ExcludeOp(op);
        cnt -= 2;
      } else if (
        Clipper.SlopesNearCollinear(op.Prev.Pt, op.Pt, op.Next.Pt, distSqrd)
      ) {
        op = Clipper.ExcludeOp(op);
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
    c.StrictlySimple = true;
    c.AddPath(poly, PolyType.ptSubject, true);
    c.Execute(ClipType.ctUnion, result, fillType, fillType);
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

  public static GetBounds(paths: IntPoint[][]) {
    var i = 0,
      cnt = paths.length;
    while (i < cnt && paths[i].length == 0) i++;
    if (i == cnt) return new IntRect();
    var result = new IntRect();
    result.left = paths[i][0].X;
    result.right = result.left;
    result.top = paths[i][0].Y;
    result.bottom = result.top;
    for (; i < cnt; i++)
      for (var j = 0, jlen = paths[i].length; j < jlen; j++) {
        if (paths[i][j].X < result.left) result.left = paths[i][j].X;
        else if (paths[i][j].X > result.right) result.right = paths[i][j].X;
        if (paths[i][j].Y < result.top) result.top = paths[i][j].Y;
        else if (paths[i][j].Y > result.bottom) result.bottom = paths[i][j].Y;
      }
    return result;
  }

  public static Orientation(poly: IntPoint[]): boolean {
    return Clipper.Area(poly) >= 0;
  }

  public static near_zero(val: number) {
    return val > -Clipper.tolerance && val < Clipper.tolerance;
  }

  static tolerance: number = 1e-20;
  static Unassigned: number = -1;
  static horizontal: number = -9007199254740992;
  static Skip: number = -2;
  static loRange: number = 47453132; // sqrt(2^53 -1)/2
  static hiRange: number = 4503599627370495; // sqrt(2^106 -1)/2
}
