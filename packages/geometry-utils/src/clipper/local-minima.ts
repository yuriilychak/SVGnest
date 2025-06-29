import TEdge from './t-edge';
import { DIRECTION, NullPtr } from './types';

export default class LocalMinima {
    public y: number = 0;
    public leftBound: NullPtr<TEdge>;
    public rightBound: NullPtr<TEdge>;

    constructor(edge: TEdge) {
        const isClockwise = edge.Dx >= edge.Prev.Dx;
        this.y = edge.Bot.y;
        this.leftBound = isClockwise ? edge : edge.Prev;
        this.rightBound = isClockwise ? edge.Prev : edge;
        this.leftBound.Side = DIRECTION.LEFT;
        this.rightBound.Side = DIRECTION.RIGHT;
        this.leftBound.WindDelta = this.leftBound.Next === this.rightBound ? -1 : 1;
        this.rightBound.WindDelta = -this.leftBound.WindDelta;
    }
}
