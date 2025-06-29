import LocalMinima from "./local-minima";
import Scanbeam from "./scanbeam";
import TEdge from "./t-edge";
import { DIRECTION } from "./types";

export default class LocalMinimaManager {
    private minimaList: LocalMinima[] = [];

    public addEdgeBounds(edge: TEdge): void {
        let isClockwise: boolean = false;
        let minEdge: TEdge = null;

        while (true) {
            edge = edge.findNextLocMin();

            if (edge === minEdge) {
                break;
            }

            if (minEdge === null) {
                minEdge = edge;
            }

            isClockwise = edge.Dx >= edge.Prev.Dx;
            const localMinima: LocalMinima = new LocalMinima(edge);

            edge = localMinima.leftBound.processBound(isClockwise);
            const edge2: TEdge = localMinima.rightBound.processBound(!isClockwise);

            this.insert(localMinima);

            if (!isClockwise) {
                edge = edge2;
            }
        }
    }

    private insert(localMinima: LocalMinima): void {
        for (let i = 0; i < this.minimaList.length; ++i) {
            if (localMinima.y >= this.minimaList[i].y) {
                this.minimaList.splice(i, 0, localMinima);
                return;
            }
        }
        
        this.minimaList.push(localMinima);
    }

    public reset(): void {
        for (const minima of this.minimaList) {
            if (minima.leftBound !== null) {
                minima.leftBound.reset(DIRECTION.LEFT);
            }
            if (minima.rightBound !== null) {
                minima.rightBound.reset(DIRECTION.RIGHT);
            }
        }
    }

    public getScanbeam(scanbeam: Scanbeam): void {
        for (const minima of this.minimaList) {
            scanbeam.insert(minima.y);
        }
    }

    public pop(): TEdge[] {
        if (this.isEmpty) {
            throw new Error("No minima to pop");
        }

        const minima = this.minimaList.shift()!;
        return [minima.leftBound, minima.rightBound];
    }

    public get isEmpty(): boolean {
        return this.minimaList.length === 0;
    }

    public get y(): number {
        return this.isEmpty ? NaN : this.minimaList[0].y;
    }
}
