import TEdge from './t-edge';

export default class LocalMinima {
    public Y: number = 0;
    public LeftBound: TEdge | null;
    public RightBound: TEdge | null;
    public Next: LocalMinima | null;

    constructor(y: number = 0, leftBound: TEdge | null = null, rightBound: TEdge | null = null, next: LocalMinima = null) {
        this.Y = y;
        this.LeftBound = leftBound;
        this.RightBound = rightBound;
        this.Next = next;
    }
}
