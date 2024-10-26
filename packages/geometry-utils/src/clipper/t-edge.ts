import { op_Equality } from './helpers';
import { IntPoint, PolyType, EdgeSide } from './types';

export default class TEdge {
    public Bot: IntPoint;
    public Curr: IntPoint;
    public Top: IntPoint;
    public Delta: IntPoint;
    public Dx: number;
    public PolyTyp: PolyType;
    public Side: EdgeSide;
    public WindDelta: number;
    public WindCnt: number;
    public WindCnt2: number;
    public OutIdx: number;
    public Next: TEdge;
    public Prev: TEdge;
    public NextInLML: TEdge;
    public NextInAEL: TEdge;
    public PrevInAEL: TEdge;
    public NextInSEL: TEdge;
    public PrevInSEL: TEdge;

    constructor() {
        this.Bot = { X: 0, Y: 0 };
        this.Curr = { X: 0, Y: 0 };
        this.Top = { X: 0, Y: 0 };
        this.Delta = { X: 0, Y: 0 };
        this.Dx = 0;
        this.PolyTyp = PolyType.ptSubject;
        this.Side = EdgeSide.esLeft;
        this.WindDelta = 0;
        this.WindCnt = 0;
        this.WindCnt2 = 0;
        this.OutIdx = 0;
        this.Next = null;
        this.Prev = null;
        this.NextInLML = null;
        this.NextInAEL = null;
        this.PrevInAEL = null;
        this.NextInSEL = null;
        this.PrevInSEL = null;
    }

    public init(nextEdge: TEdge, prevEdge: TEdge, point: IntPoint): void {
        this.Next = nextEdge;
        this.Prev = prevEdge;
        //e.Curr = pt;
        this.Curr.X = point.X;
        this.Curr.Y = point.Y;
        this.OutIdx = -1;
    }

    public initFromPolyType(polyType: PolyType): void {
        if (this.Curr.Y >= this.Next.Curr.Y) {
            //e.Bot = e.Curr;
            this.Bot.X = this.Curr.X;
            this.Bot.Y = this.Curr.Y;
            //e.Top = e.Next.Curr;
            this.Top.X = this.Next.Curr.X;
            this.Top.Y = this.Next.Curr.Y;
        } else {
            //e.Top = e.Curr;
            this.Top.X = this.Curr.X;
            this.Top.Y = this.Curr.Y;
            //e.Bot = e.Next.Curr;
            this.Bot.X = this.Next.Curr.X;
            this.Bot.Y = this.Next.Curr.Y;
        }

        this.setDx();

        this.PolyTyp = polyType;
    }

    public remove(): TEdge {
        const result: TEdge = this.Next;
        //removes e from double_linked_list (but without removing from memory)
        this.Prev.Next = this.Next;
        this.Next.Prev = this.Prev;
        this.Prev = null; //flag as removed (see ClipperBase.Clear)
        this.Next = null;

        return result;
    }

    public reverseHorizontal(): void {
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        var tmp = this.Top.X;
        this.Top.X = this.Bot.X;
        this.Bot.X = tmp;
    }

    public findNextLocMin(): TEdge {
        let result: TEdge = this;
        let edge: TEdge = null;

        while (true) {
            while (!op_Equality(result.Bot, result.Prev.Bot) || op_Equality(result.Curr, result.Top)) {
                result = result.Next;
            }

            if (result.Dx != TEdge.horizontal && result.Prev.Dx != TEdge.horizontal) {
                break;
            }

            while (result.Prev.Dx == TEdge.horizontal) {
                result = result.Prev;
            }

            edge = result;

            while (result.Dx == TEdge.horizontal) {
                result = result.Next;
            }
            if (result.Top.Y == result.Prev.Bot.Y) {
                continue;
            }
            //ie just an intermediate horz.
            if (edge.Prev.Bot.X < result.Bot.X) {
                result = edge;
            }

            break;
        }

        return result;
    }

    public setDx(): void {
        this.Delta.X = this.Top.X - this.Bot.X;
        this.Delta.Y = this.Top.Y - this.Bot.Y;

        if (this.Delta.Y === 0) {
            this.Dx = TEdge.horizontal;
        } else {
            this.Dx = this.Delta.X / this.Delta.Y;
        }
    }

    private static horizontal = -9007199254740992; //-2^53
}
