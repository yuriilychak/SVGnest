import { ClipType, Direction, EdgeSide, PolyFillType, PolyType } from "./enums";
import Int128 from "./int-128";
import IntPoint from "./int-point";

export default class TEdge {
  public Bot: IntPoint = new IntPoint();
  public Curr: IntPoint = new IntPoint();
  public Top: IntPoint = new IntPoint();
  public Delta: IntPoint = new IntPoint();
  public Dx: number = 0;
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
    this.Curr.X = point.X;
    this.Curr.Y = point.Y;
    this.OutIdx = -1;
  }

  public topX(currentY: number): number {
    //if (edge.Bot == edge.Curr) alert ("edge.Bot = edge.Curr");
    //if (edge.Bot == edge.Top) alert ("edge.Bot = edge.Top");
    return currentY === this.Top.Y
      ? this.Top.X
      : this.Bot.X + TEdge.Round(this.Dx * (currentY - this.Bot.Y));
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
      (result.OutIdx === -2 ||
        (result.NextInAEL === result.PrevInAEL && !result.isHorizontal))
      ? null
      : result;
  }

  public getNextInAEL(direction: Direction): TEdge {
    return direction == Direction.LeftToRight ? this.NextInAEL : this.PrevInAEL;
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

  public get isHorizontal(): boolean {
    return this.Delta.Y === 0;
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
}
