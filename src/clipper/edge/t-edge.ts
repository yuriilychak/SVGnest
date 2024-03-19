import {
  ClipType,
  Direction,
  EdgeSide,
  PolyFillType,
  PolyType
} from "../enums";
import Int128 from "../int-128";
import IntPoint from "../int-point";

export default class TEdge {
  public Bot: IntPoint = new IntPoint();
  public Curr: IntPoint = new IntPoint();
  public Top: IntPoint = new IntPoint();
  public Delta: IntPoint = new IntPoint();
  public deltaX: number = 0;
  public PolyTyp: PolyType = PolyType.Subject;
  public Side: EdgeSide = EdgeSide.Left;
  public WindDelta: number = 0;
  public WindCnt: number = 0;
  public WindCnt2: number = 0;
  public OutIdx: number = 0;
  public Next: TEdge = null;
  public Prev: TEdge = null;
  public NextInLML: TEdge = null;
  public NextInAEL: TEdge = null;
  public PrevInAEL: TEdge = null;
  public NextInSEL: TEdge = null;
  public PrevInSEL: TEdge = null;

  constructor() {}

  public init(nextEdge: TEdge, prevEdge: TEdge, point: IntPoint): void {
    this.Next = nextEdge;
    this.Prev = prevEdge;
    //e.Curr = pt;
    this.Curr.set(point);
    this.OutIdx = -1;
  }

  public topX(currentY: number): number {
    //if (edge.Bot == edge.Curr) alert ("edge.Bot = edge.Curr");
    //if (edge.Bot == edge.Top) alert ("edge.Bot = edge.Top");
    return currentY === this.Top.Y
      ? this.Top.X
      : this.Bot.X + TEdge.Round(this.deltaX * (currentY - this.Bot.Y));
  }

  public swapPolyIndices(edge: TEdge): void {
    const outIdx: number = this.OutIdx;

    this.OutIdx = edge.OutIdx;
    edge.OutIdx = outIdx;
  }

  public swapSides(edge: TEdge): void {
    var side = this.Side;
    this.Side = edge.Side;
    edge.Side = side;
  }

  public update(side: EdgeSide): void {
    this.Curr.set(this.Bot);
    this.Side = side;
    this.OutIdx = -1;
  }

  public initFromPolyType(polyType: PolyType): void {
    const condition: boolean = this.Curr.Y >= this.Next.Curr.Y;
    const bottom: IntPoint = condition ? this.Curr : this.Next.Curr;
    const top: IntPoint = condition ? this.Next.Curr : this.Curr;

    this.Bot.set(bottom);
    this.Top.set(top);
    this.Delta.set(this.Top).sub(this.Bot);
    this.deltaX =
      this.Delta.Y === 0 ? TEdge.horizontal : this.Delta.X / this.Delta.Y;
    this.PolyTyp = polyType;
  }

  public remove(): TEdge {
    //removes e from double_linked_list (but without removing from memory)
    this.Prev.Next = this.Next;
    this.Next.Prev = this.Prev;
    this.Prev = null; //flag as removed (see ClipperBase.Clear)
    return this.Next;
  }

  public reverseHorizontal(): void {
    //swap horizontal edges' top and bottom x's so they follow the natural
    //progression of the bounds - ie so their xbots will align with the
    //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
    const tmp: number = this.Top.X;
    this.Top.X = this.Bot.X;
    this.Bot.X = tmp;
  }

  public isIntermediate(Y: number): boolean {
    return this.Top.Y == Y && this.NextInLML !== null;
  }

  public isMaxima(Y: number): boolean {
    return this.Top.Y == Y && this.NextInLML === null;
  }

  public getMaximaPair(): TEdge {
    let result: TEdge = null;

    if (this.Top.equal(this.Next.Top) && this.Next.NextInLML === null) {
      result = this.Next;
    } else if (this.Top.equal(this.Prev.Top) && this.Prev.NextInLML === null) {
      result = this.Prev;
    }

    return result !== null &&
      (result.OutIdx === TEdge.skip ||
        (result.NextInAEL === result.PrevInAEL && !result.isHorizontal))
      ? null
      : result;
  }

  public getNextInAEL(direction: Direction): TEdge {
    return direction == Direction.LeftToRight ? this.NextInAEL : this.PrevInAEL;
  }

  public updateAEL(prev: TEdge | null, next: TEdge | null): void {
    this.PrevInAEL = prev;
    this.NextInAEL = next;
  }

  public updateSEL(prev: TEdge | null, next: TEdge | null): void {
    this.PrevInSEL = prev;
    this.NextInSEL = next;
  }

  public isEvenOddFillType(type1: PolyFillType, type2: PolyFillType): boolean {
    return this.PolyTyp === PolyType.Subject
      ? type1 === PolyFillType.EvenOdd
      : type2 === PolyFillType.EvenOdd;
  }

  public getJoinsEdge(useFullRange: boolean): TEdge | null {
    if (this.WindDelta === 0) {
      return null;
    }

    if (this._checkJoinCondition(this.PrevInAEL, useFullRange)) {
      return this.PrevInAEL;
    }

    return this._checkJoinCondition(this.NextInAEL, useFullRange)
      ? this.NextInAEL
      : null;
  }

  private _checkJoinCondition(edge: TEdge, useFullRange: boolean): boolean {
    return (
      edge !== null &&
      edge.Curr.equal(this.Bot) &&
      edge.isValid &&
      edge.Curr.Y > edge.Top.Y &&
      TEdge.slopesEqual(this, edge, useFullRange)
    );
  }

  public isContributing(
    clipType: ClipType,
    subjFillType: PolyFillType,
    clipFillType: PolyFillType
  ): boolean {
    var pft, pft2;
    if (this.PolyTyp == PolyType.Subject) {
      pft = subjFillType;
      pft2 = clipFillType;
    } else {
      pft = clipFillType;
      pft2 = subjFillType;
    }

    switch (pft) {
      case PolyFillType.EvenOdd:
        if (this.WindDelta === 0 && this.WindCnt != 1) return false;
        break;
      case PolyFillType.NonZero:
        if (Math.abs(this.WindCnt) != 1) return false;
        break;
      case PolyFillType.Positive:
        if (this.WindCnt != 1) return false;
        break;
      default:
        if (this.WindCnt != -1) return false;
        break;
    }
    switch (clipType) {
      case ClipType.Intersection:
        switch (pft2) {
          case PolyFillType.EvenOdd:
          case PolyFillType.NonZero:
            return this.WindCnt2 !== 0;
          case PolyFillType.Positive:
            return this.WindCnt2 > 0;
          default:
            return this.WindCnt2 < 0;
        }
      case ClipType.Union:
        switch (pft2) {
          case PolyFillType.EvenOdd:
          case PolyFillType.NonZero:
            return this.WindCnt2 === 0;
          case PolyFillType.Positive:
            return this.WindCnt2 <= 0;
          default:
            return this.WindCnt2 >= 0;
        }
      case ClipType.Difference:
        if (this.PolyTyp == PolyType.Subject)
          switch (pft2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.WindCnt2 === 0;
            case PolyFillType.Positive:
              return this.WindCnt2 <= 0;
            default:
              return this.WindCnt2 >= 0;
          }
        else
          switch (pft2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.WindCnt2 !== 0;
            case PolyFillType.Positive:
              return this.WindCnt2 > 0;
            default:
              return this.WindCnt2 < 0;
          }
      case ClipType.Xor:
        if (this.WindDelta === 0)
          switch (pft2) {
            case PolyFillType.EvenOdd:
            case PolyFillType.NonZero:
              return this.WindCnt2 === 0;
            case PolyFillType.Positive:
              return this.WindCnt2 <= 0;
            default:
              return this.WindCnt2 >= 0;
          }
        else return true;
    }

    return true;
  }

  public get isValid(): boolean {
    return this.OutIdx >= 0 && this.WindDelta !== 0;
  }

  public get isHorizontal(): boolean {
    return this.Delta.Y === 0;
  }

  public get nextLocMin(): TEdge {
    let edge: TEdge = this;
    var E2;
    for (;;) {
      while (
        IntPoint.unequal(edge.Bot, edge.Prev.Bot) ||
        edge.Curr.equal(edge.Top)
      )
        edge = edge.Next;
      if (
        edge.deltaX != TEdge.horizontal &&
        edge.Prev.deltaX != TEdge.horizontal
      )
        break;
      while (edge.Prev.deltaX == TEdge.horizontal) edge = edge.Prev;
      E2 = edge;
      while (edge.deltaX == TEdge.horizontal) edge = edge.Next;
      if (edge.Top.Y == edge.Prev.Bot.Y) continue;
      //ie just an intermediate horz.
      if (E2.Prev.Bot.X < edge.Bot.X) edge = E2;
      break;
    }
    return edge;
  }

  public static slopesEqual(
    edge1: TEdge,
    edge2: TEdge,
    useFullRange: boolean
  ): boolean {
    if (useFullRange)
      return Int128.op_Equality(
        Int128.Int128Mul(edge1.Delta.Y, edge2.Delta.X),
        Int128.Int128Mul(edge1.Delta.X, edge2.Delta.Y)
      );
    else
      return (
        TEdge.castInt64(edge1.Delta.Y * edge2.Delta.X) ==
        TEdge.castInt64(edge1.Delta.X * edge2.Delta.Y)
      );
  }

  public static castInt64(a: number): number {
    if (a < -2147483648 || a > 2147483647)
      return a < 0 ? Math.ceil(a) : Math.floor(a);
    else return ~~a;
  }

  public static Round(value: number): number {
    return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
  }

  public static e2InsertsBeforeE1(e1: TEdge, e2: TEdge): boolean {
    if (e2.Curr.X == e1.Curr.X) {
      if (e2.Top.Y > e1.Top.Y) return e2.Top.X < e1.topX(e2.Top.Y);
      else return e1.Top.X > e2.topX(e1.Top.Y);
    } else return e2.Curr.X < e1.Curr.X;
  }

  public static intersectPoint(
    edge1: TEdge,
    edge2: TEdge,
    ip: IntPoint,
    useFullRange: boolean
  ): boolean {
    ip.update(0, 0);
    let b1: number = 0;
    let b2: number = 0;
    //nb: with very large coordinate values, it's possible for SlopesEqual() to
    //return false but for the edge.Dx value be equal due to double precision rounding.
    if (
      TEdge.slopesEqual(edge1, edge2, useFullRange) ||
      edge1.deltaX == edge2.deltaX
    ) {
      ip.set(edge2.Bot.Y > edge1.Bot.Y ? edge2.Bot : edge1.Bot);

      return false;
    } else if (edge1.Delta.X === 0) {
      ip.X = edge1.Bot.X;
      if (edge2.isHorizontal) {
        ip.Y = edge2.Bot.Y;
      } else {
        b2 = edge2.Bot.Y - edge2.Bot.X / edge2.deltaX;
        ip.Y = TEdge.Round(ip.X / edge2.deltaX + b2);
      }
    } else if (edge2.Delta.X === 0) {
      ip.X = edge2.Bot.X;
      if (edge1.isHorizontal) {
        ip.Y = edge1.Bot.Y;
      } else {
        b1 = edge1.Bot.Y - edge1.Bot.X / edge1.deltaX;
        ip.Y = TEdge.Round(ip.X / edge1.deltaX + b1);
      }
    } else {
      b1 = edge1.Bot.X - edge1.Bot.Y * edge1.deltaX;
      b2 = edge2.Bot.X - edge2.Bot.Y * edge2.deltaX;

      const q: number = (b2 - b1) / (edge1.deltaX - edge2.deltaX);

      ip.Y = TEdge.Round(q);
      ip.X =
        Math.abs(edge1.deltaX) < Math.abs(edge2.deltaX)
          ? TEdge.Round(edge1.deltaX * q + b1)
          : TEdge.Round(edge2.deltaX * q + b2);
    }
    if (ip.Y < edge1.Top.Y || ip.Y < edge2.Top.Y) {
      if (edge1.Top.Y > edge2.Top.Y) {
        ip.Y = edge1.Top.Y;
        ip.X = edge2.topX(edge1.Top.Y);
        return ip.X < edge1.Top.X;
      } else ip.Y = edge2.Top.Y;

      ip.X =
        Math.abs(edge1.deltaX) < Math.abs(edge2.deltaX)
          ? edge1.topX(ip.Y)
          : edge2.topX(ip.Y);
    }
    return true;
  }

  public static horizontal: number = -9007199254740992;
  public static skip: number = -2;
}
