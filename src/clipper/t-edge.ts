import { EdgeSide, PolyType } from "./enums";
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

  public get isHorizontal(): boolean {
    return this.Delta.Y === 0;
  }

  public isIntermediate(Y: number): boolean {
    return this.Top.Y == Y && this.NextInLML !== null;
  }

  public isMaxima(Y: number): boolean {
    return this.Top.Y == Y && this.NextInLML === null;
  }

  public static Round(value: number): number {
    return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
  }
}
