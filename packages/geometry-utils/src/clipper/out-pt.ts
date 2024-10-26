import { IntPoint } from './types';

export default class OutPt {
    public Idx: number;

    public Pt: IntPoint;

    public Next: OutPt | null;

    public Prev: OutPt | null;

    constructor() {
        this.Idx = 0;
        this.Pt = { X: 0, Y: 0 };
        this.Next = null;
        this.Prev = null;
    }

    public exclude(): OutPt {
        const result: OutPt = this.Prev;
        result.Next = this.Next;
        this.Next.Prev = result;
        result.Idx = 0;

        return result;
    }
}
