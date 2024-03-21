import { Point } from "../../geom";
import { clipperRound } from "../../util";
import { ClipType, EdgeSide, PolyFillType, PolyType } from "../enums";
import PointRecord from "../point-record";

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
  public nextInLML: TEdge = null;
  private _ael: PointRecord<TEdge> = new PointRecord<TEdge>();
  private _sel: PointRecord<TEdge> = new PointRecord<TEdge>();
  private _current: PointRecord<TEdge> = new PointRecord<TEdge>();

  public init(nextEdge: TEdge, prevEdge: TEdge, point: Point): void {
    this._current.update(prevEdge, nextEdge);
    this.set(point);
    this.outIndex = -1;
  }

  public topX(currentY: number): number {
    return currentY === this.top.y
      ? this.top.x
      : this.bottom.x + clipperRound(this.deltaX * (currentY - this.bottom.y));
  }

  public swapPolyIndices(edge: TEdge): void {
    this.swapSides(edge);

    const outIdx: number = this.outIndex;

    this.outIndex = edge.outIndex;
    edge.outIndex = outIdx;
  }

  public swapSides(edge: TEdge): void {
    const side: EdgeSide = this.side;
    this.side = edge.side;
    edge.side = side;
  }

  public fromSide(side: EdgeSide): void {
    this.set(this.bottom);
    this.side = side;
    this.outIndex = -1;
  }

  public initFromPolyType(polyType: PolyType): void {
    const condition: boolean = this.y >= this._current.next.y;
    const bottom: Point = condition ? this : this._current.next;
    const top: Point = condition ? this._current.next : this;

    this.bottom.set(bottom);
    this.top.set(top);
    this.delta.set(this.top).sub(this.bottom);
    this.deltaX =
      this.delta.y === 0 ? TEdge.horizontal : this.delta.x / this.delta.y;
    this.polyType = polyType;
  }

  public remove(): TEdge {
    this._current.prev.next = this._current.next;
    this._current.next.prev = this._current.prev;
    this._current.prev = null; //flag as removed (see ClipperBase.Clear)
    return this._current.next;
  }

  public reverseHorizontal(): void {
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

    if (
      this.top.equal(this._current.next.top) &&
      this._current.next.nextInLML === null
    ) {
      result = this._current.next;
    } else if (
      this.top.equal(this._current.prev.top) &&
      this._current.prev.nextInLML === null
    ) {
      result = this._current.prev;
    }

    return result !== null &&
      (result.outIndex === TEdge.skip ||
        (result._ael.next === result._ael.prev && !result.isHorizontal))
      ? null
      : result;
  }

  public isEvenOddFillType(type1: PolyFillType, type2: PolyFillType): boolean {
    return this.polyType === PolyType.Subject
      ? type1 === PolyFillType.EvenOdd
      : type2 === PolyFillType.EvenOdd;
  }

  public getJoinsEdge(): TEdge | null {
    if (this.windDelta === 0) {
      return null;
    }

    if (this._checkJoinCondition(this._ael.prev)) {
      return this._ael.prev;
    }

    return this._checkJoinCondition(this._ael.next) ? this._ael.next : null;
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

  private _checkJoinCondition(edge: TEdge): boolean {
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
    const isSubject: boolean = this.polyType == PolyType.Subject;
    const type1: PolyFillType = isSubject ? subjFillType : clipFillType;
    const type2: PolyFillType = isSubject ? clipFillType : subjFillType;

    switch (type1) {
      case PolyFillType.EvenOdd:
        if (this.windDelta === 0 && this.windCount1 !== 1) {
          return false;
        }
        break;
      case PolyFillType.NonZero:
        if (Math.abs(this.windCount1) !== 1) {
          return false;
        }
        break;
      case PolyFillType.Positive:
        if (this.windCount1 !== 1) {
          return false;
        }
        break;
      default:
        if (this.windCount1 !== -1) {
          return false;
        }
        break;
    }

    switch (clipType) {
      case ClipType.Intersection:
        switch (type2) {
          case PolyFillType.EvenOdd:
          case PolyFillType.NonZero:
            return this.windCnt2 !== 0;
          case PolyFillType.Positive:
            return this.windCnt2 > 0;
          default:
            return this.windCnt2 < 0;
        }
      case ClipType.Union:
        switch (type2) {
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
          switch (type2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.windCnt2 === 0;
            case PolyFillType.Positive:
              return this.windCnt2 <= 0;
            default:
              return this.windCnt2 >= 0;
          }
        else
          switch (type2) {
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
          switch (type2) {
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

  public get next(): TEdge {
    return this._current.next;
  }

  public set next(value: TEdge) {
    this._current.next = value;
  }

  public get prev(): TEdge {
    return this._current.prev;
  }

  public set prev(value: TEdge) {
    this._current.prev = value;
  }

  public get sel(): PointRecord<TEdge> {
    return this._sel;
  }

  public get ael(): PointRecord<TEdge> {
    return this._ael;
  }

  public get isValid(): boolean {
    return this.outIndex >= 0 && this.windDelta !== 0;
  }

  public get isHorizontal(): boolean {
    return this.delta.y === 0;
  }

  public get nextLocMin(): TEdge {
    let edge1: TEdge = this;
    let edge2: TEdge;

    while (true) {
      while (!edge1.bottom.equal(edge1.prev.bottom) || edge1.equal(edge1.top))
        edge1 = edge1.next;
      if (
        edge1.deltaX != TEdge.horizontal &&
        edge1.prev.deltaX != TEdge.horizontal
      ) {
        break;
      }

      while (edge1.prev.deltaX == TEdge.horizontal) {
        edge1 = edge1.prev;
      }

      edge2 = edge1;

      while (edge1.deltaX == TEdge.horizontal) {
        edge1 = edge1.next;
      }

      if (edge1.top.y == edge1.prev.bottom.y) {
        continue;
      }
      if (edge2.prev.bottom.x < edge1.bottom.x) {
        edge1 = edge2;
      }
      break;
    }

    return edge1;
  }

  public static slopesEqual(edge1: TEdge, edge2: TEdge): boolean {
    return Point.slopesEqual(edge1.delta, edge2.delta);
  }

  public static e2InsertsBeforeE1(edge1: TEdge, edge2: TEdge): boolean {
    if (edge2.x === edge1.x) {
      return edge2.top.y > edge1.top.y
        ? edge2.top.x < edge1.topX(edge2.top.y)
        : edge1.top.x > edge2.topX(edge1.top.y);
    }

    return edge2.x < edge1.x;
  }

  public static intersectPoint(
    edge1: TEdge,
    edge2: TEdge,
    point: Point
  ): boolean {
    point.update(0, 0);

    let b1: number = 0;
    let b2: number = 0;

    if (TEdge.slopesEqual(edge1, edge2) || edge1.deltaX == edge2.deltaX) {
      point.set(edge2.bottom.y > edge1.bottom.y ? edge2.bottom : edge1.bottom);

      return false;
    }

    if (edge1.delta.x === 0) {
      point.x = edge1.bottom.x;

      if (edge2.isHorizontal) {
        point.y = edge2.bottom.y;
      } else {
        b2 = edge2.bottom.y - edge2.bottom.x / edge2.deltaX;
        point.y = clipperRound(point.x / edge2.deltaX + b2);
      }
    } else if (edge2.delta.x === 0) {
      point.x = edge2.bottom.x;

      if (edge1.isHorizontal) {
        point.y = edge1.bottom.y;
      } else {
        b1 = edge1.bottom.y - edge1.bottom.x / edge1.deltaX;
        point.y = clipperRound(point.x / edge1.deltaX + b1);
      }
    } else {
      b1 = edge1.bottom.x - edge1.bottom.y * edge1.deltaX;
      b2 = edge2.bottom.x - edge2.bottom.y * edge2.deltaX;

      const q: number = (b2 - b1) / (edge1.deltaX - edge2.deltaX);

      point.update(
        Math.abs(edge1.deltaX) < Math.abs(edge2.deltaX)
          ? clipperRound(edge1.deltaX * q + b1)
          : clipperRound(edge2.deltaX * q + b2),
        clipperRound(q)
      );
    }
    if (point.y < edge1.top.y || point.y < edge2.top.y) {
      if (edge1.top.y > edge2.top.y) {
        point.update(edge2.topX(edge1.top.y), edge1.top.y);

        return point.x < edge1.top.x;
      }

      point.y = edge2.top.y;
      point.x =
        Math.abs(edge1.deltaX) < Math.abs(edge2.deltaX)
          ? edge1.topX(point.y)
          : edge2.topX(point.y);
    }

    return true;
  }

  public static horizontal: number = -9007199254740992;

  public static skip: number = -2;
}
