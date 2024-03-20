import { Point } from "../../geom";
import {
  ClipType,
  Direction,
  EdgeSide,
  PolyFillType,
  PolyType
} from "../enums";

export default class TEdge extends Point {
  public bottom: Point = Point.empty();
  public top: Point = Point.empty();
  public delta: Point = Point.empty();
  public deltaX: number = 0;
  public polyType: PolyType = PolyType.Subject;
  public side: EdgeSide = EdgeSide.Left;
  public windDelta: number = 0;
  public windCount1: number = 0;
  public windCnt2: number = 0;
  public outIndex: number = 0;
  public next: TEdge = null;
  public prev: TEdge = null;
  public nextInLML: TEdge = null;
  public nextInAEL: TEdge = null;
  public prevInAEL: TEdge = null;
  public nextInSEL: TEdge = null;
  public prevInSEL: TEdge = null;

  public init(nextEdge: TEdge, prevEdge: TEdge, point: Point): void {
    this.next = nextEdge;
    this.prev = prevEdge;
    //e.Curr = pt;
    this.set(point);
    this.outIndex = -1;
  }

  public topX(currentY: number): number {
    //if (edge.Bot == edge.Curr) alert ("edge.Bot = edge.Curr");
    //if (edge.Bot == edge.Top) alert ("edge.Bot = edge.Top");
    return currentY === this.top.y
      ? this.top.x
      : this.bottom.x + TEdge.Round(this.deltaX * (currentY - this.bottom.y));
  }

  public swapPolyIndices(edge: TEdge): void {
    this.swapSides(edge);

    const outIdx: number = this.outIndex;

    this.outIndex = edge.outIndex;
    edge.outIndex = outIdx;
  }

  public swapSides(edge: TEdge): void {
    var side = this.side;
    this.side = edge.side;
    edge.side = side;
  }

  public fromSide(side: EdgeSide): void {
    this.set(this.bottom);
    this.side = side;
    this.outIndex = -1;
  }

  public initFromPolyType(polyType: PolyType): void {
    const condition: boolean = this.y >= this.next.y;
    const bottom: Point = condition ? this : this.next;
    const top: Point = condition ? this.next : this;

    this.bottom.set(bottom);
    this.top.set(top);
    this.delta.set(this.top).sub(this.bottom);
    this.deltaX =
      this.delta.y === 0 ? TEdge.horizontal : this.delta.x / this.delta.y;
    this.polyType = polyType;
  }

  public remove(): TEdge {
    //removes e from double_linked_list (but without removing from memory)
    this.prev.next = this.next;
    this.next.prev = this.prev;
    this.prev = null; //flag as removed (see ClipperBase.Clear)
    return this.next;
  }

  public reverseHorizontal(): void {
    //swap horizontal edges' top and bottom x's so they follow the natural
    //progression of the bounds - ie so their xbots will align with the
    //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
    const tmp: number = this.top.x;
    this.top.x = this.bottom.x;
    this.bottom.x = tmp;
  }

  public isIntermediate(Y: number): boolean {
    return this.top.y == Y && this.nextInLML !== null;
  }

  public isMaxima(Y: number): boolean {
    return this.top.y == Y && this.nextInLML === null;
  }

  public getMaximaPair(): TEdge {
    let result: TEdge = null;

    if (this.top.equal(this.next.top) && this.next.nextInLML === null) {
      result = this.next;
    } else if (this.top.equal(this.prev.top) && this.prev.nextInLML === null) {
      result = this.prev;
    }

    return result !== null &&
      (result.outIndex === TEdge.skip ||
        (result.nextInAEL === result.prevInAEL && !result.isHorizontal))
      ? null
      : result;
  }

  public getNextInAEL(direction: Direction): TEdge {
    return direction == Direction.LeftToRight ? this.nextInAEL : this.prevInAEL;
  }

  public updateAEL(prev: TEdge | null, next: TEdge | null): void {
    this.prevInAEL = prev;
    this.nextInAEL = next;
  }

  public updateSEL(prev: TEdge | null, next: TEdge | null): void {
    this.prevInSEL = prev;
    this.nextInSEL = next;
  }

  public isEvenOddFillType(type1: PolyFillType, type2: PolyFillType): boolean {
    return this.polyType === PolyType.Subject
      ? type1 === PolyFillType.EvenOdd
      : type2 === PolyFillType.EvenOdd;
  }

  public getJoinsEdge(useFullRange: boolean): TEdge | null {
    if (this.windDelta === 0) {
      return null;
    }

    if (this._checkJoinCondition(this.prevInAEL, useFullRange)) {
      return this.prevInAEL;
    }

    return this._checkJoinCondition(this.nextInAEL, useFullRange)
      ? this.nextInAEL
      : null;
  }

  public alignWindCount(
    subjFillType: PolyFillType,
    clipFillType: PolyFillType,
    isReversed: boolean
  ): number {
    const isSubject: boolean = this.polyType == PolyType.Subject;
    const windCount: number = isReversed ? this.windCnt2 : this.windCount1;
    const fillType: PolyFillType =
      (isSubject && !isReversed) || (!isSubject && isReversed)
        ? subjFillType
        : clipFillType;

    switch (fillType) {
      case PolyFillType.Positive:
        return windCount;
      case PolyFillType.Negative:
        return -windCount;
      default:
        return Math.abs(windCount);
    }
  }

  private _checkJoinCondition(edge: TEdge, useFullRange: boolean): boolean {
    return (
      edge !== null &&
      edge.equal(this.bottom) &&
      edge.isValid &&
      edge.y > edge.top.y &&
      TEdge.slopesEqual(this, edge)
    );
  }

  public isContributing(
    clipType: ClipType,
    subjFillType: PolyFillType,
    clipFillType: PolyFillType
  ): boolean {
    var pft, pft2;
    if (this.polyType == PolyType.Subject) {
      pft = subjFillType;
      pft2 = clipFillType;
    } else {
      pft = clipFillType;
      pft2 = subjFillType;
    }

    switch (pft) {
      case PolyFillType.EvenOdd:
        if (this.windDelta === 0 && this.windCount1 != 1) return false;
        break;
      case PolyFillType.NonZero:
        if (Math.abs(this.windCount1) != 1) return false;
        break;
      case PolyFillType.Positive:
        if (this.windCount1 != 1) return false;
        break;
      default:
        if (this.windCount1 != -1) return false;
        break;
    }
    switch (clipType) {
      case ClipType.Intersection:
        switch (pft2) {
          case PolyFillType.EvenOdd:
          case PolyFillType.NonZero:
            return this.windCnt2 !== 0;
          case PolyFillType.Positive:
            return this.windCnt2 > 0;
          default:
            return this.windCnt2 < 0;
        }
      case ClipType.Union:
        switch (pft2) {
          case PolyFillType.EvenOdd:
          case PolyFillType.NonZero:
            return this.windCnt2 === 0;
          case PolyFillType.Positive:
            return this.windCnt2 <= 0;
          default:
            return this.windCnt2 >= 0;
        }
      case ClipType.Difference:
        if (this.polyType == PolyType.Subject)
          switch (pft2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.windCnt2 === 0;
            case PolyFillType.Positive:
              return this.windCnt2 <= 0;
            default:
              return this.windCnt2 >= 0;
          }
        else
          switch (pft2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.windCnt2 !== 0;
            case PolyFillType.Positive:
              return this.windCnt2 > 0;
            default:
              return this.windCnt2 < 0;
          }
      case ClipType.Xor:
        if (this.windDelta === 0)
          switch (pft2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.windCnt2 === 0;
            case PolyFillType.Positive:
              return this.windCnt2 <= 0;
            default:
              return this.windCnt2 >= 0;
          }
        else return true;
    }

    return true;
  }

  public get isValid(): boolean {
    return this.outIndex >= 0 && this.windDelta !== 0;
  }

  public get isHorizontal(): boolean {
    return this.delta.y === 0;
  }

  public get nextLocMin(): TEdge {
    let edge: TEdge = this;
    var E2;
    for (;;) {
      while (!edge.bottom.equal(edge.prev.bottom) || edge.equal(edge.top))
        edge = edge.next;
      if (
        edge.deltaX != TEdge.horizontal &&
        edge.prev.deltaX != TEdge.horizontal
      )
        break;
      while (edge.prev.deltaX == TEdge.horizontal) edge = edge.prev;
      E2 = edge;
      while (edge.deltaX == TEdge.horizontal) edge = edge.next;
      if (edge.top.y == edge.prev.bottom.y) continue;
      //ie just an intermediate horz.
      if (E2.prev.bottom.x < edge.bottom.x) edge = E2;
      break;
    }
    return edge;
  }

  public static slopesEqual(edge1: TEdge, edge2: TEdge): boolean {
    return Point.slopesEqual(edge1.delta, edge2.delta);
  }

  public static Round(value: number): number {
    return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
  }

  public static e2InsertsBeforeE1(e1: TEdge, e2: TEdge): boolean {
    if (e2.x == e1.x) {
      if (e2.top.y > e1.top.y) return e2.top.x < e1.topX(e2.top.y);
      else return e1.top.x > e2.topX(e1.top.y);
    } else return e2.x < e1.x;
  }

  public static intersectPoint(edge1: TEdge, edge2: TEdge, ip: Point): boolean {
    ip.update(0, 0);
    let b1: number = 0;
    let b2: number = 0;
    //nb: with very large coordinate values, it's possible for SlopesEqual() to
    //return false but for the edge.Dx value be equal due to double precision rounding.
    if (TEdge.slopesEqual(edge1, edge2) || edge1.deltaX == edge2.deltaX) {
      ip.set(edge2.bottom.y > edge1.bottom.y ? edge2.bottom : edge1.bottom);

      return false;
    } else if (edge1.delta.x === 0) {
      ip.x = edge1.bottom.x;
      if (edge2.isHorizontal) {
        ip.y = edge2.bottom.y;
      } else {
        b2 = edge2.bottom.y - edge2.bottom.x / edge2.deltaX;
        ip.y = TEdge.Round(ip.x / edge2.deltaX + b2);
      }
    } else if (edge2.delta.x === 0) {
      ip.x = edge2.bottom.x;
      if (edge1.isHorizontal) {
        ip.y = edge1.bottom.y;
      } else {
        b1 = edge1.bottom.y - edge1.bottom.x / edge1.deltaX;
        ip.y = TEdge.Round(ip.x / edge1.deltaX + b1);
      }
    } else {
      b1 = edge1.bottom.x - edge1.bottom.y * edge1.deltaX;
      b2 = edge2.bottom.x - edge2.bottom.y * edge2.deltaX;

      const q: number = (b2 - b1) / (edge1.deltaX - edge2.deltaX);

      ip.y = TEdge.Round(q);
      ip.x =
        Math.abs(edge1.deltaX) < Math.abs(edge2.deltaX)
          ? TEdge.Round(edge1.deltaX * q + b1)
          : TEdge.Round(edge2.deltaX * q + b2);
    }
    if (ip.y < edge1.top.y || ip.y < edge2.top.y) {
      if (edge1.top.y > edge2.top.y) {
        ip.y = edge1.top.y;
        ip.x = edge2.topX(edge1.top.y);
        return ip.x < edge1.top.x;
      } else ip.y = edge2.top.y;

      ip.x =
        Math.abs(edge1.deltaX) < Math.abs(edge2.deltaX)
          ? edge1.topX(ip.y)
          : edge2.topX(ip.y);
    }
    return true;
  }

  public static horizontal: number = -9007199254740992;

  public static skip: number = -2;
}
