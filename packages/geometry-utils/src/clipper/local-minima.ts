import TEdge from './t-edge';
import { NullPtr } from './types';

export default class LocalMinima {
    public y: number = 0;
    public leftBound: NullPtr<TEdge>;
    public rightBound: NullPtr<TEdge>;

    constructor(y: number, leftBound: TEdge, rightBound: TEdge) {
        this.y = y;
        this.leftBound = leftBound;
        this.rightBound = rightBound;
    }
}
