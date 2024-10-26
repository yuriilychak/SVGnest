import OutPt from './out-pt';
import PolyNode from './poly-node';

export default class OutRec {
    public Idx: number;
    public IsHole: boolean;
    public IsOpen: boolean;
    public FirstLeft: OutRec;
    public Pts: OutPt;
    public BottomPt: OutPt;
    public PolyNode: PolyNode;

    constructor() {
        this.Idx = 0;
        this.IsHole = false;
        this.IsOpen = false;
        this.FirstLeft = null;
        this.Pts = null;
        this.BottomPt = null;
        this.PolyNode = null;
    }
}
