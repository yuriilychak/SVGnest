import { cycle_index_wasm as cycle_index } from "wasm-nesting";
import { Point } from "../types";
import { HORIZONTAL, UNASSIGNED } from "./constants";
import TEdge from "./t-edge";
import { DIRECTION, POLY_TYPE } from "./types";
import { PointI32 } from "../geometry";

export default class TEdgeController {
    private _edges: TEdge[];
    private _isUseFullRange: boolean = true;
    private _paths: number[][];
    private _edgeData: number[][];

    public constructor() {
        this._edges = [];
        this._paths = [];
        this._edgeData = [];
    }

    public createPath(polygon: Point<Int32Array>[], polyType: POLY_TYPE): number {
        let lastIndex = polygon.length - 1;

        while (
            lastIndex > 0 &&
            (polygon[lastIndex].almostEqual(polygon[0]) || polygon[lastIndex].almostEqual(polygon[lastIndex - 1]))
        ) {
            --lastIndex;
        }

        if (lastIndex < 2) {
            return UNASSIGNED;
        }

        const pathIndex = this._paths.length;

        // Create edges array without any linking
        const edges: TEdge[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            const edge = new TEdge(polygon[i], polyType, this._edges.length);
            
            this._isUseFullRange = edge.curr.rangeTest(this._isUseFullRange);
            this._edges.push(edge);
            this._edgeData.push([pathIndex, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED]);
            edges.push(edge);
        }

        // 2. Remove duplicate vertices and collinear edges by mutating the edges array
        let changed = true;
        while (changed && edges.length > 2) {
            changed = false;

            for (i = 0; i < edges.length; ++i) {
                const currEdge = edges[i];
                const nextEdge = edges[cycle_index(i, edges.length, 1)];
                const prevEdge = edges[cycle_index(i, edges.length, -1)];

                // Check for duplicate vertices
                if (currEdge.curr.almostEqual(nextEdge.curr)) {
                    if (edges.length <= 3) {
                        break;
                    }

                    // Remove current edge from array
                    edges.splice(i, 1);
                    changed = true;
                    break;
                }

                // Check for collinear edges
                if (PointI32.slopesEqual(prevEdge.curr, currEdge.curr, nextEdge.curr, this._isUseFullRange)) {
                    if (edges.length <= 3) {
                        break;
                    }

                    // Remove current edge from array
                    edges.splice(i, 1);
                    changed = true;
                    break;
                }
            }
        }

        if (edges.length < 3) {
            return UNASSIGNED;
        }

        // 3. Second stage of edge initialization
        let isFlat: boolean = true;
        const startY = edges[0].curr.y;

        const indices: number[] = new Array(edges.length);

        for (i = 0; i < edges.length; ++i) {
            const currEdge = edges[i];
            const nextEdge = edges[cycle_index(i, edges.length, 1)];

            if (currEdge.curr.y >= nextEdge.curr.y) {
                currEdge.bot.update(currEdge.curr);
                currEdge.top.update(nextEdge.curr);
            } else {
                currEdge.top.update(currEdge.curr);
                currEdge.bot.update(nextEdge.curr);
            }

            currEdge.delta.update(currEdge.top).sub(currEdge.bot);
            currEdge.dx = currEdge.delta.y === 0 ? HORIZONTAL : currEdge.delta.x / currEdge.delta.y;

            if (isFlat && currEdge.curr.y !== startY) {
                isFlat = false;
            }

            indices[i] = currEdge.current;
            this._edgeData[currEdge.current][1] = i;
        }

        this._paths.push(indices);

        // Return the starting edge index if path is valid
        return isFlat ? UNASSIGNED : edges[0].current;
    }

    public at(index: number): TEdge | null {
        return index === UNASSIGNED || index >= this._edges.length ? null : this._edges[index];
    }

    public dispose(): void {
        this._edges.length = 0;
        this._paths.length = 0;
        this._edgeData.length = 0;
    }

    public getClockwise(index: number): boolean {
        const currEdge = this.at(index);
        const prevEdge = this.at(this.getPrev(index));

        return currEdge.dx >= prevEdge.dx;
    }

    public createLocalMinima(edgeIndex: number): number[] {
        const prevIndex = this.getPrev(edgeIndex);
        const currEdge = this.at(edgeIndex);
        const prevEdge = this.at(prevIndex);
        const isClockwise = this.getClockwise(edgeIndex);
        const y = currEdge.bot.y;
        const leftBoundIndex = isClockwise ? edgeIndex : prevIndex;
        const rightBoundIndex = isClockwise ? prevIndex : edgeIndex;
        const leftBound = isClockwise ? currEdge : prevEdge;
        const rightBound = isClockwise ? prevEdge : currEdge;

        leftBound.side = DIRECTION.LEFT;
        rightBound.side = DIRECTION.RIGHT;
        leftBound.windDelta = this.getNext(leftBoundIndex) === rightBoundIndex ? -1 : 1;
        rightBound.windDelta = -leftBound.windDelta;

        return [y, leftBoundIndex, rightBoundIndex];
    }

    public findNextLocMin(index: number): number {
        let result: number = index;

        while (true) {
            let currEdge = this.at(result);
            let prevEdge = this.at(this.getPrev(result));

            while (!currEdge.bot.almostEqual(prevEdge.bot) || currEdge.curr.almostEqual(currEdge.top)) {
                result = this.getNext(result);
                currEdge = this.at(result);
                prevEdge = this.at(this.getPrev(result));
            }

            if (!currEdge.isDxHorizontal && !prevEdge.isDxHorizontal) {
                break;
            }

            while (prevEdge.isDxHorizontal) {
                result = this.getPrev(result);
                currEdge = this.at(result);
                prevEdge = this.at(this.getPrev(result));
            }

            const edgeIndex = result

            while (currEdge.isDxHorizontal) {
                result = this.getNext(result);
                currEdge = this.at(result);
                prevEdge = this.at(this.getPrev(result));
            }

            if (currEdge.top.y === prevEdge.bot.y) {
                continue;
            }

            prevEdge = this.at(this.getPrev(edgeIndex));
            //ie just an intermediate horz.
            if (prevEdge.bot.x < currEdge.bot.x) {
                result = edgeIndex;
            }

            break;
        }

        return result;
    }

    public maximaPair(edge1Index: number): number {
        let result: number = UNASSIGNED;

        if (this.checkMaxPair(edge1Index, true)) {
            result = this.getNext(edge1Index);
        } else if (this.checkMaxPair(edge1Index, false)) {
            result = this.getPrev(edge1Index);
        }

        if(result === UNASSIGNED) {
            return UNASSIGNED;
        }

        const edge = this.at(result);

        return edge.nextActive === edge.prevActive && !edge.isHorizontal ? UNASSIGNED : result;
    }

    public processBound(index: number, isClockwise: boolean): number {
        let edge = TEdge.at(index);
        let result = edge;

        if (edge.isDxHorizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const neighboarIndex = this.getBaseNeighboar(index, !isClockwise);
            const neighboar = TEdge.at(neighboarIndex);

            if (edge.bot.x !== neighboar.bot.x) {
                edge.reverseHorizontal();
            }
        }

        let neighboarIndex = this.getBaseNeighboar(index, isClockwise);
        let neighboar = TEdge.at(neighboarIndex);

        while (result.top.y === neighboar.bot.y) {
            result = neighboar;
            neighboarIndex = this.getBaseNeighboar(neighboar.current, isClockwise);
            neighboar = TEdge.at(neighboarIndex);
        }

        if (result.isDxHorizontal) {
            //nb: at the top of a bound, horizontals are added to the bound
            //only when the preceding edge attaches to the horizontal's left vertex
            //unless a Skip edge is encountered when that becomes the top divide
            let horzNeighboarIndex = this.getBaseNeighboar(result.current, !isClockwise);
            let horzNeighboar = TEdge.at(horzNeighboarIndex);

            while (horzNeighboar.isDxHorizontal) {
                horzNeighboarIndex = this.getBaseNeighboar(horzNeighboar.current, !isClockwise);
                horzNeighboar = TEdge.at(horzNeighboarIndex);
            }

            const currNeighboarIndex = this.getBaseNeighboar(result.current, isClockwise);
            const currNeighboar = TEdge.at(currNeighboarIndex);

            if ((horzNeighboar.top.x === currNeighboar.top.x && !isClockwise) || horzNeighboar.top.x > currNeighboar.top.x) {
                result = horzNeighboar;
            }
        }

        while (edge !== result) {
            edge.nextLocalMinima = this.getBaseNeighboar(edge.current, isClockwise);

            if (this.checkReverseHorizontal(edge.current, index, !isClockwise)) {
                edge.reverseHorizontal();
            }

            edge = TEdge.at(edge.nextLocalMinima);
        }

        if (this.checkReverseHorizontal(edge.current, index, !isClockwise)) {
            edge.reverseHorizontal();
        }

        return this.getBaseNeighboar(result.current, isClockwise);
        //move to the edge just beyond current bound
    }

    private checkReverseHorizontal(edgeIndex: number, index: number, isNext: boolean): boolean {
        const edge = this.at(edgeIndex);
        const neighboarIndex = this.getBaseNeighboar(edge.current, isNext);
        const neighboar = this.at(neighboarIndex);

        return edge.isDxHorizontal && edge.current !== index && edge.bot.x !== neighboar.top.x;
    }

    private getBaseNeighboar(index: number, isNext: boolean): number {
        if (index === UNASSIGNED || index >= this._edgeData.length) {
            return UNASSIGNED;
        }

        const pathIndex = this._edgeData[index][0];
        const edgeIndex = this._edgeData[index][1];
        const pathLength = this._paths[pathIndex].length;
        const offset = isNext ? 1 : -1;

        return this._paths[pathIndex][cycle_index(edgeIndex, pathLength, offset)];
    }

    private getNext(index: number): number {
        return this.getBaseNeighboar(index, true);
    }

    private getPrev(index: number): number {
        return this.getBaseNeighboar(index, false);
    }

    private checkMaxPair(edgeIndex: number, isNext: boolean): boolean {
        const currEdge = this.at(edgeIndex);
        const index = this.getBaseNeighboar(edgeIndex, isNext);
        const edge = this.at(index);

        return index !== UNASSIGNED && edge.top.almostEqual(currEdge.top) && edge.nextLocalMinima === UNASSIGNED;
    }  

    public get isUseFullRange(): boolean {
        return this._isUseFullRange;
    }
}