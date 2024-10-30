import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import { DIRECTION } from './types';

export default class LocalMinima {
    public y: number = 0;
    public LeftBound: TEdge | null;
    public RightBound: TEdge | null;
    public Next: LocalMinima | null;

    constructor(y: number = 0, leftBound: TEdge | null = null, rightBound: TEdge | null = null, next: LocalMinima = null) {
        this.y = y;
        this.LeftBound = leftBound;
        this.RightBound = rightBound;
        this.Next = next;
    }

    public insert(currentLocalMinima: LocalMinima): LocalMinima {
        if (currentLocalMinima === null) {
            return this;
        }

        if (this.y >= currentLocalMinima.y) {
            this.Next = currentLocalMinima;

            return this;
        }

        let localMinima: LocalMinima = currentLocalMinima;

        while (localMinima.Next !== null && this.y < localMinima.Next.y) {
            localMinima = localMinima.Next;
        }

        this.Next = localMinima.Next;
        localMinima.Next = this;

        return currentLocalMinima;
    }

    public reset(): void {
        let localMinima: LocalMinima = this;

        while (localMinima != null) {
            if (localMinima.LeftBound !== null) {
                localMinima.LeftBound.reset(DIRECTION.LEFT);
            }

            if (localMinima.RightBound !== null) {
                localMinima.RightBound.reset(DIRECTION.RIGHT);
            }

            localMinima = localMinima.Next;
        }
    }

    public getScanbeam(): Scanbeam {
        let localMinima: LocalMinima = this;
        let result: Scanbeam | null = null;

        while (localMinima !== null) {
            result = Scanbeam.insert(localMinima.y, result);
            localMinima = localMinima.Next;
        }

        return result;
    }
}
