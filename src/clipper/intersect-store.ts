import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from "./enums";
import IntPoint from "./int-point";
import IntersectNode from "./intersect-node";
import JoinStore from "./join-store";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import ScanbeamStore from "./scanbeam-store";
import TEdge from "./t-edge";

interface DirData {
  Left: number | null;
  Right: number | null;
  Dir: Direction | null;
}

export default class IntersectStore {
  private _intersections: IntersectNode[];
  private _activeEdges: TEdge = null;
  private _sortedEdges: TEdge = null;
  private _outPolygon: OutPolygon;
  private _joinStore: JoinStore;
  private _clipType: ClipType;
  private _clipFillType: PolyFillType;
  private _subjFillType: PolyFillType;
  private _scanbeamStore: ScanbeamStore;

  constructor(
    outPolygon: OutPolygon,
    joinStore: JoinStore,
    scanbeamStore: ScanbeamStore
  ) {
    this._intersections = [];
    this._outPolygon = outPolygon;
    this._joinStore = joinStore;
    this._scanbeamStore = scanbeamStore;
    this._clipType = ClipType.Intersection;
    this._clipFillType = PolyFillType.EvenOdd;
    this._subjFillType = PolyFillType.EvenOdd;
  }

  public clean(): void {
    this._activeEdges = null;
    this._sortedEdges = null;
  }

  public initTypes(
    clipType: ClipType,
    clipFillType: PolyFillType,
    subjFillType: PolyFillType
  ): void {
    this._clipType = clipType;
    this._clipFillType = clipFillType;
    this._subjFillType = subjFillType;
  }

  private _addEdgeToSEL(e: TEdge): void {
    this._sortedEdges = e.addEdgeToSEL(this._sortedEdges);
  }

  private _deleteFromSEL(e: TEdge): void {
    this._sortedEdges = e.deleteFromSEL(this._sortedEdges);
  }

  private _insertEdgeIntoAEL(edge: TEdge, startEdge: TEdge): void {
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

  private _buildIntersectList(
    botY: number,
    topY: number,
    useFullRange: boolean
  ): void {
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
            !TEdge.intersectPoint(e, eNext, pt, useFullRange) &&
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

  private _intersectEdges(
    e1: TEdge,
    e2: TEdge,
    pt: IntPoint,
    protect: boolean,
    useFullRange: boolean
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
      if (this._isEvenOddFillType(e1)) {
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
      if (!this._isEvenOddFillType(e2)) e1.WindCnt2 += e2.WindDelta;
      else e1.WindCnt2 = e1.WindCnt2 === 0 ? 1 : 0;
      if (!this._isEvenOddFillType(e1)) e2.WindCnt2 -= e1.WindDelta;
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
      if (e1.PolyTyp != e2.PolyTyp)
        this._addLocalMinPoly(e1, e2, pt, useFullRange);
      else if (e1Wc == 1 && e2Wc == 1)
        switch (this._clipType) {
          case ClipType.Intersection:
            if (e1Wc2 > 0 && e2Wc2 > 0)
              this._addLocalMinPoly(e1, e2, pt, useFullRange);
            break;
          case ClipType.Union:
            if (e1Wc2 <= 0 && e2Wc2 <= 0)
              this._addLocalMinPoly(e1, e2, pt, useFullRange);
            break;
          case ClipType.Difference:
            if (
              (e1.PolyTyp == PolyType.Clip && e1Wc2 > 0 && e2Wc2 > 0) ||
              (e1.PolyTyp == PolyType.Subject && e1Wc2 <= 0 && e2Wc2 <= 0)
            )
              this._addLocalMinPoly(e1, e2, pt, useFullRange);
            break;
          case ClipType.Xor:
            this._addLocalMinPoly(e1, e2, pt, useFullRange);
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

  private _processIntersectList(useFullRange: boolean) {
    for (var i = 0, ilen = this._intersections.length; i < ilen; i++) {
      var iNode = this._intersections[i];
      this._intersectEdges(
        iNode.Edge1,
        iNode.Edge2,
        iNode.Pt,
        true,
        useFullRange
      );
      this._swapPositionsInAEL(iNode.Edge1, iNode.Edge2);
    }
    this._intersections.length = 0;
  }

  private _fixupIntersectionOrder(): boolean {
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

  public processIntersections(
    botY: number,
    topY: number,
    useFullRange: boolean
  ): boolean {
    if (this._activeEdges == null) {
      return true;
    }
    try {
      this._buildIntersectList(botY, topY, useFullRange);
      if (this._intersections.length == 0) return true;
      if (this._intersections.length == 1 || this._fixupIntersectionOrder())
        this._processIntersectList(useFullRange);
      else return false;
    } catch ($$e2) {
      this._sortedEdges = null;
      this._intersections.length = 0;
      console.error("ProcessIntersections error");
    }
    this._sortedEdges = null;
    return true;
  }

  private _swapPositionsInAEL(edge1: TEdge, edge2: TEdge): void {
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

  private _addLocalMinPoly(
    e1: TEdge,
    e2: TEdge,
    pt: IntPoint,
    useFullRange: boolean
  ) {
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
      TEdge.slopesEqual(e, prevE, useFullRange) &&
      e.WindDelta !== 0 &&
      prevE.WindDelta !== 0
    ) {
      var outPt = this._outPolygon.addOutPt(prevE, pt);
      this._joinStore.add(result, outPt, e.Top);
    }
    return result;
  }

  private _isEvenOddFillType(edge: TEdge): boolean {
    if (edge.PolyTyp == PolyType.Subject)
      return this._subjFillType == PolyFillType.EvenOdd;
    else return this._clipFillType == PolyFillType.EvenOdd;
  }

  private _setWindingCount(edge: TEdge): void {
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
    } else if (this._isEvenOddFillType(edge)) {
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
    if (this._isEvenOddAltFillType(edge)) {
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

  public insertLocalMinimaIntoAEL(
    lb: TEdge,
    rb: TEdge,
    useFullRange: boolean
  ): void {
    var Op1 = null;
    if (lb === null) {
      this._insertEdgeIntoAEL(rb, null);
      this._setWindingCount(rb);
      if (
        rb.isContributing(
          this._clipType,
          this._subjFillType,
          this._clipFillType
        )
      )
        Op1 = this._outPolygon.addOutPt(rb, rb.Bot);
    } else if (rb == null) {
      this._insertEdgeIntoAEL(lb, null);
      this._setWindingCount(lb);
      if (
        lb.isContributing(
          this._clipType,
          this._subjFillType,
          this._clipFillType
        )
      )
        Op1 = this._outPolygon.addOutPt(lb, lb.Bot);
      this._scanbeamStore.insert(lb.Top.Y);
    } else {
      this._insertEdgeIntoAEL(lb, null);
      this._insertEdgeIntoAEL(rb, lb);
      this._setWindingCount(lb);
      rb.WindCnt = lb.WindCnt;
      rb.WindCnt2 = lb.WindCnt2;
      if (
        lb.isContributing(
          this._clipType,
          this._subjFillType,
          this._clipFillType
        )
      )
        Op1 = this._addLocalMinPoly(lb, rb, lb.Bot, useFullRange);
      this._scanbeamStore.insert(lb.Top.Y);
    }
    if (rb != null) {
      if (rb.isHorizontal) {
        this._addEdgeToSEL(rb);
      } else this._scanbeamStore.insert(rb.Top.Y);
    }
    if (lb == null || rb == null) {
      return;
    }
    //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
    this._joinStore.exportGhosts(Op1, rb);

    if (
      lb.OutIdx >= 0 &&
      lb.PrevInAEL !== null &&
      lb.PrevInAEL.Curr.X == lb.Bot.X &&
      lb.PrevInAEL.OutIdx >= 0 &&
      TEdge.slopesEqual(lb.PrevInAEL, lb, useFullRange) &&
      lb.WindDelta !== 0 &&
      lb.PrevInAEL.WindDelta !== 0
    ) {
      var Op2 = this._outPolygon.addOutPt(lb.PrevInAEL, lb.Bot);
      this._joinStore.add(Op1, Op2, lb.Top);
    }
    if (lb.NextInAEL != rb) {
      if (
        rb.OutIdx >= 0 &&
        rb.PrevInAEL.OutIdx >= 0 &&
        TEdge.slopesEqual(rb.PrevInAEL, rb, useFullRange) &&
        rb.WindDelta !== 0 &&
        rb.PrevInAEL.WindDelta !== 0
      ) {
        var Op2 = this._outPolygon.addOutPt(rb.PrevInAEL, rb.Bot);
        this._joinStore.add(Op1, Op2, rb.Top);
      }
      var e = lb.NextInAEL;
      if (e !== null)
        while (e != rb) {
          //nb: For calculating winding counts etc, IntersectEdges() assumes
          //that param1 will be to the right of param2 ABOVE the intersection ...
          this._intersectEdges(rb, e, lb.Curr, false, useFullRange);
          //order important here
          e = e.NextInAEL;
        }
    }
  }

  private _updateEdgeIntoAEL(e: TEdge): TEdge {
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
      this._scanbeamStore.insert(e.Top.Y);
    }
    return e;
  }

  public processEdgesAtTopOfScanbeam(
    topY: number,
    useFullRange: boolean,
    strictlySimple: boolean
  ) {
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
        this._doMaxima(e, useFullRange);
        if (ePrev === null) e = this._activeEdges;
        else e = ePrev.NextInAEL;
      } else {
        //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
        if (e.isIntermediate(topY) && e.NextInLML.isHorizontal) {
          e = this._updateEdgeIntoAEL(e);
          if (e.OutIdx >= 0) {
            this._outPolygon.addOutPt(e, e.Bot);
          }

          this._addEdgeToSEL(e);
        } else {
          e.Curr.X = e.topX(topY);
          e.Curr.Y = topY;
        }
        if (strictlySimple) {
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
            this._joinStore.add(op, op2, e.Curr);
            //StrictlySimple (type-3) join
          }
        }
        e = e.NextInAEL;
      }
    }
    //3. Process horizontals at the Top of the scanbeam ...
    this.processHorizontals(true, useFullRange);
    //4. Promote intermediate vertices ...
    e = this._activeEdges;
    while (e !== null) {
      if (e.isIntermediate(topY)) {
        var op: OutPt = null;
        if (e.OutIdx >= 0) op = this._outPolygon.addOutPt(e, e.Top);
        e = this._updateEdgeIntoAEL(e);
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
          TEdge.slopesEqual(e, ePrev, useFullRange) &&
          e.WindDelta !== 0 &&
          ePrev.WindDelta !== 0
        ) {
          var op2 = this._outPolygon.addOutPt(ePrev, e.Bot);
          this._joinStore.add(op, op2, e.Top);
        } else if (
          eNext !== null &&
          eNext.Curr.X == e.Bot.X &&
          eNext.Curr.Y == e.Bot.Y &&
          op !== null &&
          eNext.OutIdx >= 0 &&
          eNext.Curr.Y > eNext.Top.Y &&
          TEdge.slopesEqual(e, eNext, useFullRange) &&
          e.WindDelta !== 0 &&
          eNext.WindDelta !== 0
        ) {
          var op2 = this._outPolygon.addOutPt(eNext, e.Bot);
          this._joinStore.add(op, op2, e.Top);
        }
      }
      e = e.NextInAEL;
    }
  }

  public processHorizontals(
    isTopOfScanbeam: boolean,
    useFullRange: boolean
  ): void {
    var horzEdge = this._sortedEdges;
    while (horzEdge !== null) {
      this._deleteFromSEL(horzEdge);
      this._processHorizontal(horzEdge, isTopOfScanbeam, useFullRange);
      horzEdge = this._sortedEdges;
    }
  }

  private _processHorizontal(
    horzEdge: TEdge,
    isTopOfScanbeam: boolean,
    useFullRange: boolean
  ) {
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
          this._joinStore.addGhost(this._outPolygon, horzEdge, isTopOfScanbeam);

          //so far we're still in range of the horizontal Edge  but make sure
          //we're at the last of consec. horizontals when matching with eMaxPair
          if (e == eMaxPair && IsLastHorz) {
            if (dir == Direction.LeftToRight)
              this._intersectEdges(horzEdge, e, e.Top, false, useFullRange);
            else this._intersectEdges(e, horzEdge, e.Top, false, useFullRange);
            if (eMaxPair.OutIdx >= 0) console.error("ProcessHorizontal error");
            return;
          } else if (dir == Direction.LeftToRight) {
            var Pt = new IntPoint(e.Curr.X, horzEdge.Curr.Y);
            this._intersectEdges(horzEdge, e, Pt, true, useFullRange);
          } else {
            var Pt = new IntPoint(e.Curr.X, horzEdge.Curr.Y);
            this._intersectEdges(e, horzEdge, Pt, true, useFullRange);
          }
          this._swapPositionsInAEL(horzEdge, e);
        } else if (
          (dir == Direction.LeftToRight && e.Curr.X >= horzRight) ||
          (dir == Direction.RightToLeft && e.Curr.X <= horzLeft)
        )
          break;
        e = eNext;
      }
      //end while
      this._joinStore.addGhost(this._outPolygon, horzEdge, isTopOfScanbeam);

      if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
        horzEdge = this._updateEdgeIntoAEL(horzEdge);
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
        horzEdge = this._updateEdgeIntoAEL(horzEdge);
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
          TEdge.slopesEqual(horzEdge, ePrev, useFullRange)
        ) {
          var op2 = this._outPolygon.addOutPt(ePrev, horzEdge.Bot);
          this._joinStore.add(op1, op2, horzEdge.Top);
        } else if (
          eNext !== null &&
          eNext.Curr.X == horzEdge.Bot.X &&
          eNext.Curr.Y == horzEdge.Bot.Y &&
          eNext.WindDelta !== 0 &&
          eNext.OutIdx >= 0 &&
          eNext.Curr.Y > eNext.Top.Y &&
          TEdge.slopesEqual(horzEdge, eNext, useFullRange)
        ) {
          var op2 = this._outPolygon.addOutPt(eNext, horzEdge.Bot);
          this._joinStore.add(op1, op2, horzEdge.Top);
        }
      } else horzEdge = this._updateEdgeIntoAEL(horzEdge);
    } else if (eMaxPair !== null) {
      if (eMaxPair.OutIdx >= 0) {
        if (dir == Direction.LeftToRight)
          this._intersectEdges(
            horzEdge,
            eMaxPair,
            horzEdge.Top,
            false,
            useFullRange
          );
        else
          this._intersectEdges(
            eMaxPair,
            horzEdge,
            horzEdge.Top,
            false,
            useFullRange
          );
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

  private _doMaxima(e: TEdge, useFullRange: boolean): void {
    var eMaxPair = e.getMaximaPair();
    if (eMaxPair === null) {
      if (e.OutIdx >= 0) this._outPolygon.addOutPt(e, e.Top);
      this._deleteFromAEL(e);
      return;
    }
    var eNext = e.NextInAEL;
    var use_lines = true;
    while (eNext !== null && eNext != eMaxPair) {
      this._intersectEdges(e, eNext, e.Top, true, useFullRange);
      this._swapPositionsInAEL(e, eNext);
      eNext = e.NextInAEL;
    }
    if (e.OutIdx == -1 && eMaxPair.OutIdx == -1) {
      this._deleteFromAEL(e);
      this._deleteFromAEL(eMaxPair);
    } else if (e.OutIdx >= 0 && eMaxPair.OutIdx >= 0) {
      this._intersectEdges(e, eMaxPair, e.Top, false, useFullRange);
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

  private _isEvenOddAltFillType(edge: TEdge): boolean {
    if (edge.PolyTyp == PolyType.Subject)
      return this._clipFillType == PolyFillType.EvenOdd;
    else return this._subjFillType == PolyFillType.EvenOdd;
  }

  private _deleteFromAEL(e: TEdge): void {
    this._activeEdges = e.deleteFromAEL(this._activeEdges);
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
}
