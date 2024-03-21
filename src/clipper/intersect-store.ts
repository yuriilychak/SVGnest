import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from "./enums";
import IntersectNode from "./intersect-node";
import JoinStore from "./join-store";
import OutPolygon from "./out-polygon";
import OutPt from "./out-pt";
import ScanbeamStore from "./scanbeam-store";
import { TEdge, SortedEdge, ActiveEdge } from "./edge";
import HorizontalDirection from "./horizontal-direction";
import { Point } from "../geom";

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

    let edge: TEdge = this._sortedEdge.update(this._activeEdge.source, topY);
    let isModified: boolean = true;
    let point: Point;
    let nextEdge: TEdge;
    let newNode: IntersectNode;

    while (isModified && !this._sortedEdge.isEmpty) {
      isModified = false;
      edge = this._sortedEdge.source;

      while (edge.sel.hasNext) {
        nextEdge = edge.sel.next;
        point = Point.empty();

        if (edge.x > nextEdge.x) {
          if (
            !TEdge.intersectPoint(edge, nextEdge, point) &&
            edge.x > nextEdge.x + 1
          ) {
            console.error("Intersection error");
          }

          if (point.y > botY) {
            point.update(
              Math.abs(edge.deltaX) > Math.abs(nextEdge.deltaX)
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

      if (edge.sel.hasPrev) {
        edge.sel.prev.sel.next = null;
      } else {
        break;
      }
    }
    this._sortedEdge.clean();
  }

  private _intersectEdges(
    edge1: TEdge,
    edge2: TEdge,
    point: Point,
    isProtected: boolean,
    useFullRange: boolean
  ): void {
    const e1stops: boolean =
      !isProtected && edge1.nextInLML === null && edge1.top.equal(point);
    const e2stops: boolean =
      !isProtected && edge2.nextInLML === null && edge2.top.equal(point);
    const e1Contributing: boolean = edge1.outIndex >= 0;
    const e2Contributing: boolean = edge2.outIndex >= 0;

    if (edge1.windDelta === 0 || edge2.windDelta === 0) {
      if (edge1.windDelta === 0 && edge2.windDelta === 0) {
        if ((e1stops || e2stops) && e1Contributing && e2Contributing)
          this._outPolygon.addLocalMaxPoly(
            edge1,
            edge2,
            point,
            this._activeEdge.source
          );
      } else if (
        edge1.polyType == edge2.polyType &&
        edge1.windDelta != edge2.windDelta &&
        this._clipType == ClipType.Union
      ) {
        if (edge1.windDelta === 0) {
          if (e2Contributing) {
            this._outPolygon.addOutPt(edge1, point);
            if (e1Contributing) edge1.outIndex = -1;
          }
        } else {
          if (e1Contributing) {
            this._outPolygon.addOutPt(edge2, point);
            if (e2Contributing) {
              edge2.outIndex = -1;
            }
          }
        }
      } else if (edge1.polyType != edge2.polyType) {
        if (
          edge1.windDelta === 0 &&
          Math.abs(edge2.windCount1) == 1 &&
          (this._clipType != ClipType.Union || edge2.windCnt2 === 0)
        ) {
          this._outPolygon.addOutPt(edge1, point);
          if (e1Contributing) {
            edge1.outIndex = -1;
          }
        } else if (
          edge2.windDelta === 0 &&
          Math.abs(edge1.windCount1) == 1 &&
          (this._clipType != ClipType.Union || edge1.windCnt2 === 0)
        ) {
          this._outPolygon.addOutPt(edge2, point);
          if (e2Contributing) {
            edge2.outIndex = -1;
          }
        }
      }

      if (e1stops) {
        if (edge1.outIndex < 0) {
          this._activeEdge.delete(edge1);
        } else {
          console.error("Error intersecting polylines");
        }
      }

      if (e2stops) {
        if (edge2.outIndex < 0) {
          this._activeEdge.delete(edge2);
        } else {
          console.error("Error intersecting polylines");
        }
      }
      return;
    }

    if (edge1.polyType == edge2.polyType) {
      if (edge1.isEvenOddFillType(this._subjFillType, this._clipFillType)) {
        const oldE1WindCnt: number = edge1.windCount1;
        edge1.windCount1 = edge2.windCount1;
        edge2.windCount1 = oldE1WindCnt;
      } else {
        edge1.windCount1 =
          edge1.windCount1 === -edge2.windDelta
            ? -edge1.windCount1
            : edge1.windCount1 + edge2.windDelta;
        edge2.windCount1 =
          edge2.windCount1 === edge1.windDelta
            ? -edge2.windCount1
            : edge2.windCount1 - edge1.windDelta;
      }
    } else {
      if (!edge2.isEvenOddFillType(this._subjFillType, this._clipFillType))
        edge1.windCnt2 += edge2.windDelta;
      else edge1.windCnt2 = edge1.windCnt2 === 0 ? 1 : 0;
      if (!edge1.isEvenOddFillType(this._subjFillType, this._clipFillType))
        edge2.windCnt2 -= edge1.windDelta;
      else edge2.windCnt2 = edge2.windCnt2 === 0 ? 1 : 0;
    }

    const e1Wc: number = edge1.alignWindCount(
      this._subjFillType,
      this._clipFillType,
      false
    );
    const e2Wc: number = edge2.alignWindCount(
      this._subjFillType,
      this._clipFillType,
      false
    );

    if (e1Contributing && e2Contributing) {
      if (
        e1stops ||
        e2stops ||
        (e1Wc !== 0 && e1Wc != 1) ||
        (e2Wc !== 0 && e2Wc != 1) ||
        (edge1.polyType != edge2.polyType && this._clipType != ClipType.Xor)
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
        edge1.swapPolyIndices(edge2);
      }
    } else if (e1Contributing) {
      if (e2Wc === 0 || e2Wc == 1) {
        this._outPolygon.addOutPt(edge1, point);
        edge1.swapPolyIndices(edge2);
      }
    } else if (e2Contributing) {
      if (e1Wc === 0 || e1Wc == 1) {
        this._outPolygon.addOutPt(edge2, point);
        edge1.swapPolyIndices(edge2);
      }
    } else if (
      (e1Wc === 0 || e1Wc == 1) &&
      (e2Wc === 0 || e2Wc == 1) &&
      !e1stops &&
      !e2stops
    ) {
      if (edge1.polyType != edge2.polyType) {
        this._addLocalMinPoly(edge1, edge2, point, useFullRange);
      } else if (e1Wc == 1 && e2Wc == 1) {
        const e1Wc2: number = edge1.alignWindCount(
          this._clipFillType,
          this._subjFillType,
          true
        );
        const e2Wc2: number = edge2.alignWindCount(
          this._clipFillType,
          this._subjFillType,
          true
        );

        switch (this._clipType) {
          case ClipType.Intersection:
            if (e1Wc2 > 0 && e2Wc2 > 0) {
              this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            }
            break;
          case ClipType.Union:
            if (e1Wc2 <= 0 && e2Wc2 <= 0) {
              this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            }
            break;
          case ClipType.Difference:
            if (
              (edge1.polyType == PolyType.Clip && e1Wc2 > 0 && e2Wc2 > 0) ||
              (edge1.polyType == PolyType.Subject && e1Wc2 <= 0 && e2Wc2 <= 0)
            ) {
              this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            }
            break;
          case ClipType.Xor:
            this._addLocalMinPoly(edge1, edge2, point, useFullRange);
            break;
        }
      } else {
        edge1.swapSides(edge2);
      }
    }

    if (
      e1stops != e2stops &&
      ((e1stops && edge1.outIndex >= 0) || (e2stops && edge2.outIndex >= 0))
    ) {
      edge1.swapPolyIndices(edge2);
    }

    if (e1stops) {
      this._activeEdge.delete(edge1);
    }

    if (e2stops) {
      this._activeEdge.delete(edge2);
    }
  }

  private _processIntersectList(useFullRange: boolean) {
    const intersectionCount: number = this._intersections.length;
    let i: number = 0;
    let intersectNode: IntersectNode;

    for (i = 0; i < intersectionCount; ++i) {
      intersectNode = this._intersections[i];

      this._intersectEdges(
        intersectNode.edge1,
        intersectNode.edge2,
        intersectNode,
        true,
        useFullRange
      );
      this._activeEdge.swap(intersectNode.edge1, intersectNode.edge2);
    }

    this._intersections.length = 0;
  }

  private _fixupIntersectionOrder(): boolean {
    this._intersections.sort(IntersectNode.compare);
    this._sortedEdge.update(this._activeEdge.source);

    const intersectionCount: number = this._intersections.length;
    let i: number = 0;
    let j: number = 0;
    let intersectNode: IntersectNode;

    for (i = 0; i < intersectionCount; ++i) {
      if (!this._intersections[i].edgesAdjacent) {
        j = i + 1;

        while (j < intersectionCount && !this._intersections[j].edgesAdjacent) {
          ++j;
        }

        if (j == intersectionCount) {
          return false;
        }

        intersectNode = this._intersections[i];
        this._intersections[i] = this._intersections[j];
        this._intersections[j] = intersectNode;
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

      if (this._intersections.length == 0) {
        return true;
      }

      if (this._intersections.length == 1 || this._fixupIntersectionOrder()) {
        this._processIntersectList(useFullRange);
      } else {
        return false;
      }
    } catch {
      this._sortedEdge.clean();
      this._intersections.length = 0;
      console.error("ProcessIntersections error");
    }
    this._sortedEdge.clean();

    return true;
  }

  private _addLocalMinPoly(
    edge1: TEdge,
    edge2: TEdge,
    point: Point,
    useFullRange: boolean
  ): OutPt {
    const condition: boolean =
      edge2.isHorizontal || edge1.deltaX > edge2.deltaX;
    const primaryEdge: TEdge = condition ? edge1 : edge2;
    const secondaryEdge: TEdge = condition ? edge2 : edge1;
    let result: OutPt = this._outPolygon.addOutPt(primaryEdge, point);

    secondaryEdge.outIndex = primaryEdge.outIndex;
    primaryEdge.side = EdgeSide.Left;
    secondaryEdge.side = EdgeSide.Right;

    let edge: TEdge = primaryEdge;
    let prevEdge: TEdge =
      edge.ael.prev == secondaryEdge ? secondaryEdge.ael.prev : edge.ael.prev;

    if (
      prevEdge !== null &&
      prevEdge.isValid &&
      prevEdge.topX(point.y) == edge.topX(point.y) &&
      TEdge.slopesEqual(edge, prevEdge) &&
      edge.windDelta !== 0
    ) {
      var outPt = this._outPolygon.addOutPt(prevEdge, point);
      this._joinStore.add(result, outPt, edge.top);
    }

    return result;
  }

  private _setWindingCount(edge: TEdge): void {
    let edge1: TEdge = edge.ael.prev;

    while (
      edge1 !== null &&
      (edge1.polyType != edge.polyType || edge1.windDelta === 0)
    ) {
      edge1 = edge1.ael.prev;
    }

    if (edge1 === null) {
      edge.windCount1 = edge.windDelta === 0 ? 1 : edge.windDelta;
      edge.windCnt2 = 0;
      edge1 = this._activeEdge.source;
    } else if (edge.windDelta === 0 && this._clipType != ClipType.Union) {
      edge.windCount1 = 1;
      edge.windCnt2 = edge1.windCnt2;
      edge1 = edge1.ael.next;
    } else if (edge.isEvenOddFillType(this._subjFillType, this._clipFillType)) {
      if (edge.windDelta === 0) {
        let isInside: boolean = true;
        let edge2: TEdge = edge1.ael.prev;

        while (edge2 !== null) {
          if (edge2.polyType == edge1.polyType && edge2.windDelta !== 0) {
            isInside = !isInside;
          }
          edge2 = edge2.ael.prev;
        }
        edge.windCount1 = isInside ? 0 : 1;
      } else {
        edge.windCount1 = edge.windDelta;
      }
      edge.windCnt2 = edge1.windCnt2;
      edge1 = edge1.ael.next;
    } else {
      if (edge1.windCount1 * edge1.windDelta < 0) {
        if (Math.abs(edge1.windCount1) > 1) {
          edge.windCount1 =
            edge1.windDelta * edge.windDelta < 0
              ? edge1.windCount1
              : edge1.windCount1 + edge.windDelta;
        } else {
          edge.windCount1 = edge.windDelta === 0 ? 1 : edge.windDelta;
        }
      } else {
        if (edge.windDelta === 0) {
          edge.windCount1 =
            edge1.windCount1 < 0 ? edge1.windCount1 - 1 : edge1.windCount1 + 1;
        } else {
          edge.windCount1 =
            edge1.windDelta * edge.windDelta < 0
              ? edge1.windCount1
              : edge1.windCount1 + edge.windDelta;
        }
      }

      edge.windCnt2 = edge1.windCnt2;
      edge1 = edge1.ael.next;
    }

    if (edge.isEvenOddFillType(this._clipFillType, this._subjFillType)) {
      while (edge1 != edge) {
        if (edge1.windDelta !== 0) edge.windCnt2 = edge.windCnt2 === 0 ? 1 : 0;
        edge1 = edge1.ael.next;
      }
    } else {
      while (edge1 != edge) {
        edge.windCnt2 += edge1.windDelta;
        edge1 = edge1.ael.next;
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
      edge2.windCount1 = edge1.windCount1;
      edge2.windCnt2 = edge1.windCnt2;
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
      ? this._addLocalMinPoly(edge1, edge2, edge1.bottom, useFullRange)
      : this._outPolygon.addOutPt(edge1, edge1.bottom);
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
      this._scanbeamStore.insert(leftBound.top.y);
    }

    if (!isRightBoundEmpty) {
      if (rightBound.isHorizontal) {
        this._sortedEdge.add(rightBound);
      } else this._scanbeamStore.insert(rightBound.top.y);
    }

    if (isEmpty) {
      return;
    }

    this._joinStore.exportGhosts(outPt1, rightBound);

    if (
      leftBound.isValid &&
      leftBound.ael.prev !== null &&
      leftBound.ael.prev.x == leftBound.x &&
      leftBound.ael.prev.isValid &&
      TEdge.slopesEqual(leftBound.ael.prev, leftBound)
    ) {
      outPt2 = this._outPolygon.addOutPt(leftBound.ael.prev, leftBound.bottom);
      this._joinStore.add(outPt1, outPt2, leftBound.top);
    }
    if (leftBound.ael.next != rightBound) {
      if (
        rightBound.isValid &&
        rightBound.ael.prev.isValid &&
        TEdge.slopesEqual(rightBound.ael.prev, rightBound)
      ) {
        outPt2 = this._outPolygon.addOutPt(
          rightBound.ael.prev,
          rightBound.bottom
        );
        this._joinStore.add(outPt1, outPt2, rightBound.top);
      }

      let edge: TEdge = leftBound.ael.next;

      if (edge !== null)
        while (edge != rightBound) {
          this._intersectEdges(
            rightBound,
            edge,
            leftBound,
            false,
            useFullRange
          );

          edge = edge.ael.next;
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
        prev = edge.ael.prev;
        this._doMaxima(edge, useFullRange);
        edge = prev === null ? this._activeEdge.source : prev.ael.next;
      } else {
        //2. promote horizontal edges, otherwise update Curr.X and Curr.Y ...
        if (edge.isIntermediate(topY) && edge.nextInLML.isHorizontal) {
          edge = this._activeEdge.update(edge, this._scanbeamStore);
          if (edge.outIndex >= 0) {
            this._outPolygon.addOutPt(edge, edge.bottom);
          }

          this._sortedEdge.add(edge);
        } else {
          edge.update(edge.topX(topY), topY);
        }
        if (strictlySimple) {
          prev = edge.ael.prev;

          if (
            edge.isValid &&
            edge.ael.hasPrev &&
            prev.isValid &&
            prev.x == edge.x
          ) {
            outPt = this._outPolygon.addOutPt(prev, edge);
            const op2: OutPt = this._outPolygon.addOutPt(edge, edge);
            this._joinStore.add(outPt, op2, edge);
          }
        }
        edge = edge.ael.next;
      }
    }

    this.processHorizontals(true, useFullRange);

    edge = this._activeEdge.source;

    while (edge !== null) {
      if (edge.isIntermediate(topY)) {
        outPt = null;

        if (edge.outIndex >= 0) {
          outPt = this._outPolygon.addOutPt(edge, edge.top);
        }

        edge = this._activeEdge.update(edge, this._scanbeamStore);

        if (outPt === null) {
          continue;
        }

        this._updateJoins(edge, outPt);
      }

      edge = edge.ael.next;
    }
  }

  public processHorizontals(
    isTopOfScanbeam: boolean,
    useFullRange: boolean
  ): void {
    let edge: TEdge = this._sortedEdge.source;

    while (edge !== null) {
      this._sortedEdge.delete(edge);
      this._processHorizontal(edge, isTopOfScanbeam, useFullRange);
      edge = this._sortedEdge.source;
    }
  }

  private _processHorizontal(
    horzEdge: TEdge,
    isTopOfScanbeam: boolean,
    useFullRange: boolean
  ) {
    const dirData: HorizontalDirection = new HorizontalDirection(horzEdge);
    let lastHorzEdge: TEdge = horzEdge;
    let maxPairEdge: TEdge = null;
    let isLastHorz: boolean;
    let edge: TEdge;
    let nextEdge: TEdge;

    while (
      lastHorzEdge.nextInLML !== null &&
      lastHorzEdge.nextInLML.isHorizontal
    ) {
      lastHorzEdge = lastHorzEdge.nextInLML;
    }

    if (lastHorzEdge.nextInLML === null) {
      maxPairEdge = lastHorzEdge.getMaximaPair();
    }

    while (true) {
      isLastHorz = horzEdge == lastHorzEdge;
      edge = horzEdge.ael.getNext(dirData.direction);

      while (edge !== null) {
        if (
          edge.x === horzEdge.top.x &&
          horzEdge.nextInLML !== null &&
          edge.deltaX < horzEdge.nextInLML.deltaX
        ) {
          break;
        }

        nextEdge = edge.ael.getNext(dirData.direction);
        //saves eNext for later
        if (dirData.getIncluded(edge)) {
          this._joinStore.addGhost(this._outPolygon, horzEdge, isTopOfScanbeam);

          const isLeft: boolean = dirData.direction === Direction.LeftToRight;
          const edge1: TEdge = isLeft ? horzEdge : edge;
          const edge2: TEdge = isLeft ? edge : horzEdge;
          const isProtected = !(edge == maxPairEdge && isLastHorz);
          const point: Point = isProtected
            ? Point.fromCords(edge.x, horzEdge.y)
            : edge.top;

          this._intersectEdges(edge1, edge2, point, isProtected, useFullRange);

          if (!isProtected) {
            if (maxPairEdge.outIndex >= 0) {
              console.error("ProcessHorizontal error");
            }

            return;
          }

          this._activeEdge.swap(horzEdge, edge);
        } else if (dirData.getExcluded(edge)) {
          break;
        }

        edge = nextEdge;
      }
      //end while
      this._joinStore.addGhost(this._outPolygon, horzEdge, isTopOfScanbeam);

      if (horzEdge.nextInLML !== null && horzEdge.nextInLML.isHorizontal) {
        horzEdge = this._activeEdge.update(horzEdge, this._scanbeamStore);
        if (horzEdge.outIndex >= 0) {
          this._outPolygon.addOutPt(horzEdge, horzEdge.bottom);
        }

        dirData.update(horzEdge);
      } else {
        break;
      }
    }
    //end for (;;)
    if (horzEdge.nextInLML !== null) {
      if (horzEdge.outIndex >= 0) {
        const op1: OutPt = this._outPolygon.addOutPt(horzEdge, horzEdge.top);

        horzEdge = this._activeEdge.update(horzEdge, this._scanbeamStore);

        //nb: HorzEdge is no longer horizontal here
        this._updateJoins(horzEdge, op1);
      } else horzEdge = this._activeEdge.update(horzEdge, this._scanbeamStore);
    } else if (maxPairEdge !== null) {
      if (maxPairEdge.outIndex >= 0) {
        const isLefDirection: boolean =
          dirData.direction == Direction.LeftToRight;
        const edge1: TEdge = isLefDirection ? horzEdge : maxPairEdge;
        const edge2: TEdge = isLefDirection ? maxPairEdge : horzEdge;

        this._intersectEdges(edge1, edge2, horzEdge.top, false, useFullRange);

        if (maxPairEdge.outIndex >= 0) {
          console.error("ProcessHorizontal error");
        }
      } else {
        this._activeEdge.delete(horzEdge);
        this._activeEdge.delete(maxPairEdge);
      }
    } else {
      if (horzEdge.outIndex >= 0) {
        this._outPolygon.addOutPt(horzEdge, horzEdge.top);
      }

      this._activeEdge.delete(horzEdge);
    }
  }

  private _updateJoins(edge: TEdge, outPt1: OutPt): void {
    const joinEdge: TEdge = edge.getJoinsEdge();

    if (joinEdge === null) {
      return;
    }

    const outPt2: OutPt = this._outPolygon.addOutPt(joinEdge, edge.bottom);
    this._joinStore.add(outPt1, outPt2, edge.top);
  }

  private _doMaxima(edge: TEdge, useFullRange: boolean): void {
    const maxPairEdge: TEdge = edge.getMaximaPair();

    if (maxPairEdge === null) {
      if (edge.outIndex >= 0) {
        this._outPolygon.addOutPt(edge, edge.top);
      }

      this._activeEdge.delete(edge);

      return;
    }

    let nextEdge: TEdge = edge.ael.next;
    let isUseLines: boolean = true;

    while (nextEdge !== null && nextEdge != maxPairEdge) {
      this._intersectEdges(edge, nextEdge, edge.top, true, useFullRange);
      this._activeEdge.swap(edge, nextEdge);
      nextEdge = edge.ael.next;
    }

    if (edge.outIndex == -1 && maxPairEdge.outIndex == -1) {
      this._activeEdge.delete(edge);
      this._activeEdge.delete(maxPairEdge);
    } else if (edge.outIndex >= 0 && maxPairEdge.outIndex >= 0) {
      this._intersectEdges(edge, maxPairEdge, edge.top, false, useFullRange);
    } else if (isUseLines && edge.windDelta === 0) {
      if (edge.outIndex >= 0) {
        this._outPolygon.addOutPt(edge, edge.top);
        edge.outIndex = -1;
      }
      this._activeEdge.delete(edge);

      if (maxPairEdge.outIndex >= 0) {
        this._outPolygon.addOutPt(maxPairEdge, edge.top);
        maxPairEdge.outIndex = -1;
      }

      this._activeEdge.delete(maxPairEdge);
    } else {
      console.error("DoMaxima error");
    }
  }
}
