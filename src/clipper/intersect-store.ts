import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from "./enums";
import IntPoint from "./int-point";
import IntersectNode from "./intersect-node";
import JoinStore from "./join-store";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import ScanbeamStore from "./scanbeam-store";
import { TEdge, SortedEdge, ActiveEdge } from "./edge";

interface DirData {
  Left: number | null;
  Right: number | null;
  Dir: Direction | null;
}

export default class IntersectStore {
  private _intersections: IntersectNode[];
  private _outPolygon: OutPolygon;
  private _joinStore: JoinStore;
  private _clipType: ClipType;
  private _clipFillType: PolyFillType;
  private _subjFillType: PolyFillType;
  private _scanbeamStore: ScanbeamStore;
  private _sortedEdge: SortedEdge;
  private _activeEdge: ActiveEdge;

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
    this._sortedEdge = new SortedEdge();
    this._activeEdge = new ActiveEdge();
  }

  public clean(): void {
    this._activeEdge.clean();
    this._sortedEdge.clean();
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

  private _buildIntersectList(
    botY: number,
    topY: number,
    useFullRange: boolean
  ): void {
    if (this._activeEdge.isEmpty) {
      return;
    }
    //prepare for sorting ...
    let edge: TEdge = this._sortedEdge.update(this._activeEdge.source, topY);
    //console.log(JSON.stringify(JSON.decycle( e )));

    //bubblesort ...
    let isModified: boolean = true;
    let point: IntPoint;
    let nextEdge: TEdge;
    let newNode: IntersectNode;

    while (isModified && !this._sortedEdge.isEmpty) {
      isModified = false;
      edge = this._sortedEdge.source;

      while (edge.NextInSEL !== null) {
        nextEdge = edge.NextInSEL;
        point = new IntPoint();
        //console.log("e.Curr.X: " + e.Curr.X + " eNext.Curr.X" + eNext.Curr.X);
        if (edge.Curr.X > nextEdge.Curr.X) {
          if (
            !TEdge.intersectPoint(edge, nextEdge, point, useFullRange) &&
            edge.Curr.X > nextEdge.Curr.X + 1
          ) {
            //console.log("e.Curr.X: "+JSON.stringify(JSON.decycle( e.Curr.X )));
            //console.log("eNext.Curr.X+1: "+JSON.stringify(JSON.decycle( eNext.Curr.X+1)));
            console.error("Intersection error");
          }

          if (point.Y > botY) {
            point.update(
              Math.abs(edge.Dx) > Math.abs(nextEdge.Dx)
                ? nextEdge.topX(botY)
                : edge.topX(botY),
              botY
            );
          }

          newNode = new IntersectNode(edge, nextEdge, point);

          this._intersections.push(newNode);
          this._sortedEdge.swap(newNode);
          isModified = true;
        } else edge = nextEdge;
      }

      if (edge.PrevInSEL !== null) {
        edge.PrevInSEL.NextInSEL = null;
      } else {
        break;
      }
    }
    this._sortedEdge.clean();
  }

  private _intersectEdges(
    edge1: TEdge,
    edge2: TEdge,
    point: IntPoint,
    isProtected: boolean,
    useFullRange: boolean
  ): void {
    //e1 will be to the left of e2 BELOW the intersection. Therefore e1 is before
    //e2 in AEL except when e1 is being inserted at the intersection point ...
    var e1stops =
      !isProtected && edge1.NextInLML === null && edge1.Top.equal(point);
    var e2stops =
      !isProtected && edge2.NextInLML === null && edge2.Top.equal(point);
    var e1Contributing = edge1.OutIdx >= 0;
    var e2Contributing = edge2.OutIdx >= 0;

    //if either edge is on an OPEN path ...
    if (edge1.WindDelta === 0 || edge2.WindDelta === 0) {
      //ignore subject-subject open path intersections UNLESS they
      //are both open paths, AND they are both 'contributing maximas' ...
      if (edge1.WindDelta === 0 && edge2.WindDelta === 0) {
        if ((e1stops || e2stops) && e1Contributing && e2Contributing)
          this._outPolygon.addLocalMaxPoly(
            edge1,
            edge2,
            point,
            this._activeEdge.source
          );
      }
      //if intersecting a subj line with a subj poly ...
      else if (
        edge1.PolyTyp == edge2.PolyTyp &&
        edge1.WindDelta != edge2.WindDelta &&
        this._clipType == ClipType.Union
      ) {
        if (edge1.WindDelta === 0) {
          if (e2Contributing) {
            this._outPolygon.addOutPt(edge1, point);
            if (e1Contributing) edge1.OutIdx = -1;
          }
        } else {
          if (e1Contributing) {
            this._outPolygon.addOutPt(edge2, point);
            if (e2Contributing) {
              edge2.OutIdx = -1;
            }
          }
        }
      } else if (edge1.PolyTyp != edge2.PolyTyp) {
        if (
          edge1.WindDelta === 0 &&
          Math.abs(edge2.WindCnt) == 1 &&
          (this._clipType != ClipType.Union || edge2.WindCnt2 === 0)
        ) {
          this._outPolygon.addOutPt(edge1, point);
          if (e1Contributing) {
            edge1.OutIdx = -1;
          }
        } else if (
          edge2.WindDelta === 0 &&
          Math.abs(edge1.WindCnt) == 1 &&
          (this._clipType != ClipType.Union || edge1.WindCnt2 === 0)
        ) {
          this._outPolygon.addOutPt(edge2, point);
          if (e2Contributing) {
            edge2.OutIdx = -1;
          }
        }
      }

      if (e1stops) {
        if (edge1.OutIdx < 0) {
          this._activeEdge.delete(edge1);
        } else {
          console.error("Error intersecting polylines");
        }
      }

      if (e2stops) {
        if (edge2.OutIdx < 0) {
          this._activeEdge.delete(edge2);
        } else {
          console.error("Error intersecting polylines");
        }
      }
      return;
    }

    //update winding counts...
    //assumes that e1 will be to the Right of e2 ABOVE the intersection
    if (edge1.PolyTyp == edge2.PolyTyp) {
      if (edge1.isEvenOddFillType(this._subjFillType, this._clipFillType)) {
        var oldE1WindCnt = edge1.WindCnt;
        edge1.WindCnt = edge2.WindCnt;
        edge2.WindCnt = oldE1WindCnt;
      } else {
        if (edge1.WindCnt + edge2.WindDelta === 0)
          edge1.WindCnt = -edge1.WindCnt;
        else edge1.WindCnt += edge2.WindDelta;
        if (edge2.WindCnt - edge1.WindDelta === 0)
          edge2.WindCnt = -edge2.WindCnt;
        else edge2.WindCnt -= edge1.WindDelta;
      }
    } else {
      if (!edge2.isEvenOddFillType(this._subjFillType, this._clipFillType))
        edge1.WindCnt2 += edge2.WindDelta;
      else edge1.WindCnt2 = edge1.WindCnt2 === 0 ? 1 : 0;
      if (!edge1.isEvenOddFillType(this._subjFillType, this._clipFillType))
        edge2.WindCnt2 -= edge1.WindDelta;
      else edge2.WindCnt2 = edge2.WindCnt2 === 0 ? 1 : 0;
    }
    var e1FillType, e2FillType, e1FillType2, e2FillType2;
    if (edge1.PolyTyp == PolyType.Subject) {
      e1FillType = this._subjFillType;
      e1FillType2 = this._clipFillType;
    } else {
      e1FillType = this._clipFillType;
      e1FillType2 = this._subjFillType;
    }
    if (edge2.PolyTyp == PolyType.Subject) {
      e2FillType = this._subjFillType;
      e2FillType2 = this._clipFillType;
    } else {
      e2FillType = this._clipFillType;
      e2FillType2 = this._subjFillType;
    }
    var e1Wc, e2Wc;
    switch (e1FillType) {
      case PolyFillType.Positive:
        e1Wc = edge1.WindCnt;
        break;
      case PolyFillType.Negative:
        e1Wc = -edge1.WindCnt;
        break;
      default:
        e1Wc = Math.abs(edge1.WindCnt);
        break;
    }
    switch (e2FillType) {
      case PolyFillType.Positive:
        e2Wc = edge2.WindCnt;
        break;
      case PolyFillType.Negative:
        e2Wc = -edge2.WindCnt;
        break;
      default:
        e2Wc = Math.abs(edge2.WindCnt);
        break;
    }
    if (e1Contributing && e2Contributing) {
      if (
        e1stops ||
        e2stops ||
        (e1Wc !== 0 && e1Wc != 1) ||
        (e2Wc !== 0 && e2Wc != 1) ||
        (edge1.PolyTyp != edge2.PolyTyp && this._clipType != ClipType.Xor)
      )
        this._outPolygon.addLocalMaxPoly(
          edge1,
          edge2,
          point,
          this._activeEdge.source
        );
      else {
        this._outPolygon.addOutPt(edge1, point);
        this._outPolygon.addOutPt(edge2, point);
        edge1.swapSides(edge2);
        edge1.swapPolyIndices(edge2);
      }
    } else if (e1Contributing) {
      if (e2Wc === 0 || e2Wc == 1) {
        this._outPolygon.addOutPt(edge1, point);
        edge1.swapSides(edge2);
        edge1.swapPolyIndices(edge2);
      }
    } else if (e2Contributing) {
      if (e1Wc === 0 || e1Wc == 1) {
        this._outPolygon.addOutPt(edge2, point);
        edge1.swapSides(edge2);
        edge1.swapPolyIndices(edge2);
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
          e1Wc2 = edge1.WindCnt2;
          break;
        case PolyFillType.Negative:
          e1Wc2 = -edge1.WindCnt2;
          break;
        default:
          e1Wc2 = Math.abs(edge1.WindCnt2);
          break;
      }
      switch (e2FillType2) {
        case PolyFillType.Positive:
          e2Wc2 = edge2.WindCnt2;
          break;
        case PolyFillType.Negative:
          e2Wc2 = -edge2.WindCnt2;
          break;
        default:
          e2Wc2 = Math.abs(edge2.WindCnt2);
          break;
      }
      if (edge1.PolyTyp != edge2.PolyTyp)
        this._addLocalMinPoly(edge1, edge2, point, useFullRange);
      else if (e1Wc == 1 && e2Wc == 1)
        switch (this._clipType) {
          case ClipType.Intersection:
            if (e1Wc2 > 0 && e2Wc2 > 0)
              this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            break;
          case ClipType.Union:
            if (e1Wc2 <= 0 && e2Wc2 <= 0)
              this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            break;
          case ClipType.Difference:
            if (
              (edge1.PolyTyp == PolyType.Clip && e1Wc2 > 0 && e2Wc2 > 0) ||
              (edge1.PolyTyp == PolyType.Subject && e1Wc2 <= 0 && e2Wc2 <= 0)
            )
              this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            break;
          case ClipType.Xor:
            this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            break;
        }
      else edge1.swapSides(edge2);
    }
    if (
      e1stops != e2stops &&
      ((e1stops && edge1.OutIdx >= 0) || (e2stops && edge2.OutIdx >= 0))
    ) {
      edge1.swapSides(edge2);
      edge1.swapPolyIndices(edge2);
    }
    //finally, delete any non-contributing maxima edges  ...
    if (e1stops) this._activeEdge.delete(edge1);
    if (e2stops) this._activeEdge.delete(edge2);
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
      this._activeEdge.swap(iNode.Edge1, iNode.Edge2);
    }
    this._intersections.length = 0;
  }

  private _fixupIntersectionOrder(): boolean {
    //pre-condition: intersections are sorted bottom-most first.
    //Now it's crucial that intersections are made only between adjacent edges,
    //so to ensure this the order of intersections may need adjusting ...
    this._intersections.sort(IntersectNode.compare);
    this._sortedEdge.update(this._activeEdge.source);

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
      this._sortedEdge.swap(this._intersections[i]);
    }
    return true;
  }

  public processIntersections(
    botY: number,
    topY: number,
    useFullRange: boolean
  ): boolean {
    if (this._activeEdge.isEmpty) {
      return true;
    }
    try {
      this._buildIntersectList(botY, topY, useFullRange);
      if (this._intersections.length == 0) return true;
      if (this._intersections.length == 1 || this._fixupIntersectionOrder())
        this._processIntersectList(useFullRange);
      else return false;
    } catch ($$e2) {
      this._sortedEdge.clean();
      this._intersections.length = 0;
      console.error("ProcessIntersections error");
    }
    this._sortedEdge.clean();

    return true;
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

  private _setWindingCount(edge: TEdge): void {
    var e = edge.PrevInAEL;
    //find the edge of the same polytype that immediately preceeds 'edge' in AEL
    while (e !== null && (e.PolyTyp != edge.PolyTyp || e.WindDelta === 0))
      e = e.PrevInAEL;
    if (e === null) {
      edge.WindCnt = edge.WindDelta === 0 ? 1 : edge.WindDelta;
      edge.WindCnt2 = 0;
      e = this._activeEdge.source;
      //ie get ready to calc WindCnt2
    } else if (edge.WindDelta === 0 && this._clipType != ClipType.Union) {
      edge.WindCnt = 1;
      edge.WindCnt2 = e.WindCnt2;
      e = e.NextInAEL;
      //ie get ready to calc WindCnt2
    } else if (edge.isEvenOddFillType(this._subjFillType, this._clipFillType)) {
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
    if (edge.isEvenOddFillType(this._clipFillType, this._subjFillType)) {
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

  private _insertLocalMinimaIntoAEL(
    useFullRange: boolean,
    edge1: TEdge,
    edge2: TEdge = null
  ): OutPt | null {
    const hasSecondEdge: boolean = edge2 !== null;
    this._activeEdge.insert(edge1);

    if (hasSecondEdge) {
      this._activeEdge.insert(edge2, edge1);
    }

    this._setWindingCount(edge1);

    if (hasSecondEdge) {
      edge2.WindCnt = edge1.WindCnt;
      edge2.WindCnt2 = edge1.WindCnt2;
    }

    if (
      !edge1.isContributing(
        this._clipType,
        this._subjFillType,
        this._clipFillType
      )
    ) {
      return null;
    }

    return hasSecondEdge
      ? this._addLocalMinPoly(edge1, edge2, edge1.Bot, useFullRange)
      : this._outPolygon.addOutPt(edge1, edge1.Bot);
  }

  public insertLocalMinimaIntoAEL(
    leftBound: TEdge,
    rightBound: TEdge,
    useFullRange: boolean
  ): void {
    const isLeftBoundEmpty: boolean = leftBound === null;
    const isRightBoundEmpty: boolean = rightBound === null;
    const isEmpty: boolean = isLeftBoundEmpty || isRightBoundEmpty;
    const edge1: TEdge = isLeftBoundEmpty ? rightBound : leftBound;
    const edge2: TEdge = !isEmpty ? rightBound : null;
    const outPt1: OutPt = this._insertLocalMinimaIntoAEL(
      useFullRange,
      edge1,
      edge2
    );
    let outPt2: OutPt;

    if (!isLeftBoundEmpty) {
      this._scanbeamStore.insert(leftBound.Top.Y);
    }

    if (!isRightBoundEmpty) {
      if (rightBound.isHorizontal) {
        this._sortedEdge.add(rightBound);
      } else this._scanbeamStore.insert(rightBound.Top.Y);
    }

    if (isEmpty) {
      return;
    }
    //if output polygons share an Edge with a horizontal rb, they'll need joining later ...
    this._joinStore.exportGhosts(outPt1, rightBound);

    if (
      leftBound.isValid &&
      leftBound.PrevInAEL !== null &&
      leftBound.PrevInAEL.Curr.X == leftBound.Bot.X &&
      leftBound.PrevInAEL.isValid &&
      TEdge.slopesEqual(leftBound.PrevInAEL, leftBound, useFullRange)
    ) {
      outPt2 = this._outPolygon.addOutPt(leftBound.PrevInAEL, leftBound.Bot);
      this._joinStore.add(outPt1, outPt2, leftBound.Top);
    }
    if (leftBound.NextInAEL != rightBound) {
      if (
        rightBound.isValid &&
        rightBound.PrevInAEL.isValid &&
        TEdge.slopesEqual(rightBound.PrevInAEL, rightBound, useFullRange)
      ) {
        outPt2 = this._outPolygon.addOutPt(
          rightBound.PrevInAEL,
          rightBound.Bot
        );
        this._joinStore.add(outPt1, outPt2, rightBound.Top);
      }

      let edge: TEdge = leftBound.NextInAEL;

      if (edge !== null)
        while (edge != rightBound) {
          //nb: For calculating winding counts etc, IntersectEdges() assumes
          //that param1 will be to the right of param2 ABOVE the intersection ...
          this._intersectEdges(
            rightBound,
            edge,
            leftBound.Curr,
            false,
            useFullRange
          );
          //order important here
          edge = edge.NextInAEL;
        }
    }
  }

  public processEdgesAtTopOfScanbeam(
    topY: number,
    useFullRange: boolean,
    strictlySimple: boolean
  ) {
    let edge: TEdge = this._activeEdge.source;
    let outPt: OutPt;
    let isMaximaEdge: boolean;
    let prev: TEdge;
    let maxPairEdge: TEdge;

    while (edge !== null) {
      //1. process maxima, treating them as if they're 'bent' horizontal edges,
      //   but exclude maxima with horizontal edges. nb: e can't be a horizontal.
      isMaximaEdge = edge.isMaxima(topY);

      if (isMaximaEdge) {
        maxPairEdge = edge.getMaximaPair();
        isMaximaEdge = maxPairEdge === null || !maxPairEdge.isHorizontal;
      }

      if (isMaximaEdge) {
        prev = edge.PrevInAEL;
        this._doMaxima(edge, useFullRange);
        edge = prev === null ? this._activeEdge.source : prev.NextInAEL;
      } else {
        //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
        if (edge.isIntermediate(topY) && edge.NextInLML.isHorizontal) {
          edge = this._activeEdge.update(edge, this._scanbeamStore);
          if (edge.OutIdx >= 0) {
            this._outPolygon.addOutPt(edge, edge.Bot);
          }

          this._sortedEdge.add(edge);
        } else {
          edge.Curr.update(edge.topX(topY), topY);
        }
        if (strictlySimple) {
          prev = edge.PrevInAEL;

          if (
            edge.isValid &&
            prev !== null &&
            prev.isValid &&
            prev.Curr.X == edge.Curr.X
          ) {
            outPt = this._outPolygon.addOutPt(prev, edge.Curr);
            var op2 = this._outPolygon.addOutPt(edge, edge.Curr);
            this._joinStore.add(outPt, op2, edge.Curr);
            //StrictlySimple (type-3) join
          }
        }
        edge = edge.NextInAEL;
      }
    }
    //3. Process horizontals at the Top of the scanbeam ...
    this.processHorizontals(true, useFullRange);
    //4. Promote intermediate vertices ...
    edge = this._activeEdge.source;

    while (edge !== null) {
      if (edge.isIntermediate(topY)) {
        outPt = null;

        if (edge.OutIdx >= 0) {
          outPt = this._outPolygon.addOutPt(edge, edge.Top);
        }

        edge = this._activeEdge.update(edge, this._scanbeamStore);
        //if output polygons share an edge, they'll need joining later ...
        if (outPt === null) {
          continue;
        }

        this._updateJoins(edge, outPt, useFullRange);
      }

      edge = edge.NextInAEL;
    }
  }

  public processHorizontals(
    isTopOfScanbeam: boolean,
    useFullRange: boolean
  ): void {
    let horzEdge: TEdge = this._sortedEdge.source;

    while (horzEdge !== null) {
      this._sortedEdge.delete(horzEdge);
      this._processHorizontal(horzEdge, isTopOfScanbeam, useFullRange);
      horzEdge = this._sortedEdge.source;
    }
  }

  private _processHorizontal(
    horzEdge: TEdge,
    isTopOfScanbeam: boolean,
    useFullRange: boolean
  ) {
    let $var: DirData = { Dir: null, Left: null, Right: null };
    this.GetHorzDirection(horzEdge, $var);
    let dir: Direction = $var.Dir;
    let horzLeft: number = $var.Left;
    let horzRight: number = $var.Right;
    let lastHorzEdge: TEdge = horzEdge;
    let maxPairEdge: TEdge = null;
    let isLastHorz: boolean;
    let edge: TEdge;
    let nextEdge: TEdge;

    while (
      lastHorzEdge.NextInLML !== null &&
      lastHorzEdge.NextInLML.isHorizontal
    ) {
      lastHorzEdge = lastHorzEdge.NextInLML;
    }

    if (lastHorzEdge.NextInLML === null) {
      maxPairEdge = lastHorzEdge.getMaximaPair();
    }

    while (true) {
      isLastHorz = horzEdge == lastHorzEdge;
      edge = horzEdge.getNextInAEL(dir);

      while (edge !== null) {
        //Break if we've got to the end of an intermediate horizontal edge ...
        //nb: Smaller Dx's are to the right of larger Dx's ABOVE the horizontal.
        if (
          edge.Curr.X === horzEdge.Top.X &&
          horzEdge.NextInLML !== null &&
          edge.Dx < horzEdge.NextInLML.Dx
        ) {
          break;
        }

        nextEdge = edge.getNextInAEL(dir);
        //saves eNext for later
        if (
          (dir == Direction.LeftToRight && edge.Curr.X <= horzRight) ||
          (dir == Direction.RightToLeft && edge.Curr.X >= horzLeft)
        ) {
          this._joinStore.addGhost(this._outPolygon, horzEdge, isTopOfScanbeam);

          const isLeft: boolean = dir == Direction.LeftToRight;
          const edge1: TEdge = isLeft ? horzEdge : edge;
          const edge2: TEdge = isLeft ? edge : horzEdge;
          const isProtected = !(edge == maxPairEdge && isLastHorz);
          const point: IntPoint = isProtected
            ? new IntPoint(edge.Curr.X, horzEdge.Curr.Y)
            : edge.Top;
          //so far we're still in range of the horizontal Edge  but make sure
          //we're at the last of consec. horizontals when matching with eMaxPair

          this._intersectEdges(edge1, edge2, point, isProtected, useFullRange);

          if (!isProtected) {
            if (maxPairEdge.OutIdx >= 0) {
              console.error("ProcessHorizontal error");
            }

            return;
          }

          this._activeEdge.swap(horzEdge, edge);
        } else if (
          (dir == Direction.LeftToRight && edge.Curr.X >= horzRight) ||
          (dir == Direction.RightToLeft && edge.Curr.X <= horzLeft)
        ) {
          break;
        }

        edge = nextEdge;
      }
      //end while
      this._joinStore.addGhost(this._outPolygon, horzEdge, isTopOfScanbeam);

      if (horzEdge.NextInLML !== null && horzEdge.NextInLML.isHorizontal) {
        horzEdge = this._activeEdge.update(horzEdge, this._scanbeamStore);
        if (horzEdge.OutIdx >= 0) {
          this._outPolygon.addOutPt(horzEdge, horzEdge.Bot);
        }

        $var = { Dir: dir, Left: horzLeft, Right: horzRight };
        
        this.GetHorzDirection(horzEdge, $var);
        dir = $var.Dir;
        horzLeft = $var.Left;
        horzRight = $var.Right;
      } else {
        break;
      }
    }
    //end for (;;)
    if (horzEdge.NextInLML !== null) {
      if (horzEdge.OutIdx >= 0) {
        const op1: OutPt = this._outPolygon.addOutPt(horzEdge, horzEdge.Top);

        horzEdge = this._activeEdge.update(horzEdge, this._scanbeamStore);

        //nb: HorzEdge is no longer horizontal here
        this._updateJoins(horzEdge, op1, useFullRange);
      } else horzEdge = this._activeEdge.update(horzEdge, this._scanbeamStore);
    } else if (maxPairEdge !== null) {
      if (maxPairEdge.OutIdx >= 0) {
        const isLefDirection: boolean = dir == Direction.LeftToRight;
        const edge1: TEdge = isLefDirection ? horzEdge : maxPairEdge;
        const edge2: TEdge = isLefDirection ? maxPairEdge : horzEdge;

        this._intersectEdges(edge1, edge2, horzEdge.Top, false, useFullRange);

        if (maxPairEdge.OutIdx >= 0) {
          console.error("ProcessHorizontal error");
        }
      } else {
        this._activeEdge.delete(horzEdge);
        this._activeEdge.delete(maxPairEdge);
      }
    } else {
      if (horzEdge.OutIdx >= 0) {
        this._outPolygon.addOutPt(horzEdge, horzEdge.Top);
      }

      this._activeEdge.delete(horzEdge);
    }
  }

  private _updateJoins(
    edge: TEdge,
    outPt1: OutPt,
    useFullRange: boolean
  ): void {
    const joinEdge: TEdge = edge.getJoinsEdge(useFullRange);

    if (joinEdge === null) {
      return;
    }

    const outPt2: OutPt = this._outPolygon.addOutPt(joinEdge, edge.Bot);
    this._joinStore.add(outPt1, outPt2, edge.Top);
  }

  private _doMaxima(edge: TEdge, useFullRange: boolean): void {
    const maxPairEdge: TEdge = edge.getMaximaPair();

    if (maxPairEdge === null) {
      if (edge.OutIdx >= 0) {
        this._outPolygon.addOutPt(edge, edge.Top);
      }

      this._activeEdge.delete(edge);

      return;
    }

    let nextEdge: TEdge = edge.NextInAEL;
    let isUseLines: boolean = true;

    while (nextEdge !== null && nextEdge != maxPairEdge) {
      this._intersectEdges(edge, nextEdge, edge.Top, true, useFullRange);
      this._activeEdge.swap(edge, nextEdge);
      nextEdge = edge.NextInAEL;
    }

    if (edge.OutIdx == -1 && maxPairEdge.OutIdx == -1) {
      this._activeEdge.delete(edge);
      this._activeEdge.delete(maxPairEdge);
    } else if (edge.OutIdx >= 0 && maxPairEdge.OutIdx >= 0) {
      this._intersectEdges(edge, maxPairEdge, edge.Top, false, useFullRange);
    } else if (isUseLines && edge.WindDelta === 0) {
      if (edge.OutIdx >= 0) {
        this._outPolygon.addOutPt(edge, edge.Top);
        edge.OutIdx = -1;
      }
      this._activeEdge.delete(edge);

      if (maxPairEdge.OutIdx >= 0) {
        this._outPolygon.addOutPt(maxPairEdge, edge.Top);
        maxPairEdge.OutIdx = -1;
      }

      this._activeEdge.delete(maxPairEdge);
    } else {
      console.error("DoMaxima error");
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
}
