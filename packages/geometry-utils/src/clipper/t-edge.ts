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
}
