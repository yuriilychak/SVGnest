import { Point } from "../../geom";
import { clipperRound } from "../../util";
import { ClipType, EdgeSide, Index, PolyFillType, PolyType } from "../enums";
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
  public index: number = 0;
  public nextInLML: TEdge | null = null;
  private _ael: PointRecord<TEdge> = new PointRecord<TEdge>();
  private _sel: PointRecord<TEdge> = new PointRecord<TEdge>();
  private _source: PointRecord<TEdge> = new PointRecord<TEdge>();

  public init(nextEdge: TEdge, prevEdge: TEdge, point: Point): void {
    this._source.update(prevEdge, nextEdge);
    this.set(point);
    this.index = Index.Empty;
  }

  public skip(): void {
    this.index = Index.Skip;
  }

  public clearIndex(): void {
    this.index = Index.Empty;
  }

  public topX(currentY: number): number {
    return currentY === this.top.y
      ? this.top.x
      : this.bottom.x + clipperRound(this.deltaX * (currentY - this.bottom.y));
  }

  public swapPolyIndices(edge: TEdge): void {
    this.swapSides(edge);

    const outIdx: number = this.index;

    this.index = edge.index;
    edge.index = outIdx;
  }

  public swapSides(edge: TEdge): void {
    const side: EdgeSide = this.side;
    this.side = edge.side;
    edge.side = side;
  }

  public fromSide(side: EdgeSide): void {
    this.set(this.bottom);
    this.side = side;
    this.index = Index.Empty;
  }

  public initFromPolyType(polyType: PolyType): void {
    const condition: boolean =
      this._source.hasNext && this.y >= this._source.unsafeNext.y;
    const bottom: Point = condition ? this : this._source.unsafeNext;
    const top: Point = condition ? this._source.unsafeNext : this;

    this.bottom.set(bottom);
    this.top.set(top);
    this.delta.set(this.top).sub(this.bottom);
    this.deltaX =
      this.delta.y === 0
        ? Number.MIN_SAFE_INTEGER
        : this.delta.x / this.delta.y;
    this.polyType = polyType;
  }

  public remove(): TEdge | null {
    if (this._source === null) {
      return null;
    }

    this._source.unsafePev.source.next = this._source.next;
    this._source.unsafeNext.source.prev = this._source.prev;
    this._source.prev = null;

    return this._source.next;
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

  public getMaximaPair(): TEdge | null {
    let result: TEdge | null = null;

    if (
      this._source.hasNext &&
      this.top.equal(this._source.unsafeNext.top) &&
      this._source.unsafeNext.nextInLML === null
    ) {
      result = this._source.next;
    } else if (
      this._source.hasPrev &&
      this.top.equal(this._source.unsafePev.top) &&
      this._source.unsafePev.nextInLML === null
    ) {
      result = this._source.prev;
    }

    return result !== null &&
      (result.isSkipped ||
        (result._ael.next === result._ael.prev && !result.isHorizontalY))
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

  private _checkJoinCondition(edge: TEdge | null): boolean {
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

  public get sel(): PointRecord<TEdge> {
    return this._sel;
  }

  public get ael(): PointRecord<TEdge> {
    return this._ael;
  }

  public get source(): PointRecord<TEdge> {
    return this._source;
  }

  public get isValid(): boolean {
    return this.isIndexDefined && this.windDelta !== 0;
  }

  public get isHorizontalY(): boolean {
    return this.delta.y === 0;
  }

  public get isSkipped(): boolean {
    return this.index === Index.Skip;
  }

  public get isHorizontalX(): boolean {
    return this.deltaX === Number.MIN_SAFE_INTEGER;
  }

  public get isIndexDefined(): boolean {
    return this.index >= 0;
  }

  public get nextLocMin(): TEdge | null {
    let edge1: TEdge | null = this;
    let edge2: TEdge | null = null;

    while (true) {
      while (
        edge1 !== null &&
        edge1.source.hasPrev &&
        (!edge1.bottom.equal(edge1.source.unsafePev.bottom) ||
          edge1.equal(edge1.top))
      ) {
        edge1 = edge1.source.next;
      }

      if (
        edge1 !== null &&
        !edge1.isHorizontalX &&
        edge1.source.hasPrev &&
        !edge1.source.unsafePev.isHorizontalX
      ) {
        break;
      }

      while (
        edge1 !== null &&
        edge1.source.hasPrev &&
        edge1.source.unsafePev.isHorizontalX
      ) {
        edge1 = edge1.source.prev;
      }

      edge2 = edge1;

      while (edge1 !== null && edge1.isHorizontalX) {
        edge1 = edge1.source.next;
      }

      if (
        edge1 !== null &&
        edge1.source.hasPrev &&
        edge1.top.y == edge1.source.unsafePev.bottom.y
      ) {
        continue;
      }
      if (
        edge1 !== null &&
        edge2 !== null &&
        edge2.source.hasPrev &&
        edge2.source.unsafePev.bottom.x < edge1.bottom.x
      ) {
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

      if (edge2.isHorizontalY) {
        point.y = edge2.bottom.y;
      } else {
        b2 = edge2.bottom.y - edge2.bottom.x / edge2.deltaX;
        point.y = clipperRound(point.x / edge2.deltaX + b2);
      }
    } else if (edge2.delta.x === 0) {
      point.x = edge2.bottom.x;

      if (edge1.isHorizontalY) {
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
}
