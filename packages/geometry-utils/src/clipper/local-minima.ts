import Scanbeam from './scanbeam';
import TEdge from './t-edge';
import { DIRECTION, NullPtr } from './types';

export default class LocalMinima {
    public y: number = 0;
    public leftBound: NullPtr<TEdge>;
    public rightBound: NullPtr<TEdge>;
    public next: NullPtr<LocalMinima>;

    constructor(y: number = 0, leftBound: NullPtr<TEdge> = null, rightBound: NullPtr<TEdge> = null, next: LocalMinima = null) {
        this.y = y;
        this.leftBound = leftBound;
        this.rightBound = rightBound;
        this.next = next;
    }

    public insert(currentLocalMinima: LocalMinima): LocalMinima {
        if (currentLocalMinima === null) {
            return this;
        }

        if (this.y >= currentLocalMinima.y) {
            this.next = currentLocalMinima;

            return this;
        }

        let localMinima: LocalMinima = currentLocalMinima;

        while (localMinima.next !== null && this.y < localMinima.next.y) {
            localMinima = localMinima.next;
        }

        this.next = localMinima.next;
        localMinima.next = this;

        return currentLocalMinima;
    }

    public reset(): void {
        let localMinima: LocalMinima = this;

        while (localMinima != null) {
            if (localMinima.leftBound !== null) {
                localMinima.leftBound.reset(DIRECTION.LEFT);
            }

            if (localMinima.rightBound !== null) {
                localMinima.rightBound.reset(DIRECTION.RIGHT);
            }

            localMinima = localMinima.next;
        }
    }

    public getScanbeam(): Scanbeam {
        let localMinima: LocalMinima = this;
        let result: NullPtr<Scanbeam> = null;

        while (localMinima !== null) {
            result = Scanbeam.insert(localMinima.y, result);
            localMinima = localMinima.next;
        }

        return result;
    }
}
