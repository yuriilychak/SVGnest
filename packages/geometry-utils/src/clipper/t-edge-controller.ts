import { cycle_index_wasm as cycle_index } from "wasm-nesting";
import { Point } from "../types";
import { HORIZONTAL, UNASSIGNED } from "./constants";
import TEdge from "./t-edge";
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from "./types";
import { PointI32 } from "../geometry";
import { clipperRound, slopesEqual } from "../helpers";

export default class TEdgeController {
    private _edges: TEdge[];
    private _isUseFullRange: boolean = true;
    private _paths: number[][];
    private _edgeData: number[][];
    public activeEdges: number = UNASSIGNED;
    public sortedEdges: number = UNASSIGNED;

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
        return this.getIndexValid(index) ? this._edges[index] : null;
    }

    public dispose(): void {
        this._edges.length = 0;
        this._paths.length = 0;
        this._edgeData.length = 0;
    }

    public getClockwise(index: number): boolean {
        const currEdge = this.at(index);
        const prevEdge = this.at(this.prev(index));

        return currEdge.dx >= prevEdge.dx;
    }

    public createLocalMinima(edgeIndex: number): number[] {
        const prevIndex = this.prev(edgeIndex);
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
        leftBound.windDelta = this.next(leftBoundIndex) === rightBoundIndex ? -1 : 1;
        rightBound.windDelta = -leftBound.windDelta;

        return [y, leftBoundIndex, rightBoundIndex];
    }

    public findNextLocMin(index: number): number {
        let result: number = index;

        while (true) {
            let currEdge = this.at(result);
            let prevEdge = this.at(this.prev(result));

            while (!currEdge.bot.almostEqual(prevEdge.bot) || currEdge.curr.almostEqual(currEdge.top)) {
                result = this.next(result);
                currEdge = this.at(result);
                prevEdge = this.at(this.prev(result));
            }

            if (!currEdge.isDxHorizontal && !prevEdge.isDxHorizontal) {
                break;
            }

            while (prevEdge.isDxHorizontal) {
                result = this.prev(result);
                currEdge = this.at(result);
                prevEdge = this.at(this.prev(result));
            }

            const edgeIndex = result

            while (currEdge.isDxHorizontal) {
                result = this.next(result);
                currEdge = this.at(result);
                prevEdge = this.at(this.prev(result));
            }

            if (currEdge.top.y === prevEdge.bot.y) {
                continue;
            }

            prevEdge = this.at(this.prev(edgeIndex));
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
            result = this.next(edge1Index);
        } else if (this.checkMaxPair(edge1Index, false)) {
            result = this.prev(edge1Index);
        }

        if (result === UNASSIGNED) {
            return UNASSIGNED;
        }

        const edge = this.at(result);

        return this.nextActive(result) === this.prevActive(result) && !edge.isHorizontal ? UNASSIGNED : result;
    }

    public hasNextLocalMinima(index: number): boolean {
        return this.getIndexValid(index) && this._edgeData[index][2] !== UNASSIGNED;
    }

    public processBound(index: number, isClockwise: boolean): number {
        let edge = this.at(index);
        let result = edge;

        if (edge.isDxHorizontal) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const neighboarIndex = this.baseNeighboar(index, !isClockwise);
            const neighboar = this.at(neighboarIndex);

            if (edge.bot.x !== neighboar.bot.x) {
                edge.reverseHorizontal();
            }
        }

        let neighboarIndex = this.baseNeighboar(index, isClockwise);
        let neighboar = this.at(neighboarIndex);

        while (result.top.y === neighboar.bot.y) {
            result = neighboar;
            neighboarIndex = this.baseNeighboar(neighboar.current, isClockwise);
            neighboar = this.at(neighboarIndex);
        }

        if (result.isDxHorizontal) {
            //nb: at the top of a bound, horizontals are added to the bound
            //only when the preceding edge attaches to the horizontal's left vertex
            //unless a Skip edge is encountered when that becomes the top divide
            let horzNeighboarIndex = this.baseNeighboar(result.current, !isClockwise);
            let horzNeighboar = this.at(horzNeighboarIndex);

            while (horzNeighboar.isDxHorizontal) {
                horzNeighboarIndex = this.baseNeighboar(horzNeighboar.current, !isClockwise);
                horzNeighboar = this.at(horzNeighboarIndex);
            }

            const currNeighboarIndex = this.baseNeighboar(result.current, isClockwise);
            const currNeighboar = this.at(currNeighboarIndex);

            if ((horzNeighboar.top.x === currNeighboar.top.x && !isClockwise) || horzNeighboar.top.x > currNeighboar.top.x) {
                result = horzNeighboar;
            }
        }

        while (edge !== result) {
            const localMinima = this.baseNeighboar(edge.current, isClockwise);
            this.setNextLocalMinima(edge.current, localMinima);

            if (this.checkReverseHorizontal(edge.current, index, !isClockwise)) {
                edge.reverseHorizontal();
            }

            edge = this.at(localMinima);
        }

        if (this.checkReverseHorizontal(edge.current, index, !isClockwise)) {
            edge.reverseHorizontal();
        }

        return this.baseNeighboar(result.current, isClockwise);
        //move to the edge just beyond current bound
    }

    public getNextLocalMinima(index: number): number {
        return this.hasNextLocalMinima(index) ? this._edgeData[index][2] : UNASSIGNED;
    }

    private setNextLocalMinima(edgeIndex: number, minimaIndex: number): void {
        if (!this.getIndexValid(edgeIndex)) {
            return;
        }

        this._edgeData[edgeIndex][2] = minimaIndex;
    }

    private checkReverseHorizontal(edgeIndex: number, index: number, isNext: boolean): boolean {
        const edge = this.at(edgeIndex);
        const neighboarIndex = this.baseNeighboar(edge.current, isNext);
        const neighboar = this.at(neighboarIndex);

        return edge.isDxHorizontal && edge.current !== index && edge.bot.x !== neighboar.top.x;
    }

    private getIndexValid(index: number): boolean {
        return index !== UNASSIGNED && index < this._edgeData.length;
    }

    private baseNeighboar(index: number, isNext: boolean): number {
        if (!this.getIndexValid(index)) {
            return UNASSIGNED;
        }

        const pathIndex = this._edgeData[index][0];
        const edgeIndex = this._edgeData[index][1];
        const pathLength = this._paths[pathIndex].length;
        const offset = isNext ? 1 : -1;

        return this._paths[pathIndex][cycle_index(edgeIndex, pathLength, offset)];
    }

    private next(index: number): number {
        return this.baseNeighboar(index, true);
    }

    private prev(index: number): number {
        return this.baseNeighboar(index, false);
    }

    private checkMaxPair(edgeIndex: number, isNext: boolean): boolean {
        const currEdge = this.at(edgeIndex);
        const index = this.baseNeighboar(edgeIndex, isNext);
        const edge = this.at(index);

        return index !== UNASSIGNED && edge.top.almostEqual(currEdge.top) && !this.hasNextLocalMinima(index);
    }

    public getStop(index: number, point: Point<Int32Array>, isProtect: boolean): boolean {
        if (isProtect || this.hasNextLocalMinima(index)) {
            return false;
        }

        const edge = this.at(index);

        return edge.top.almostEqual(point);
    }

    public getIntermediate(index: number, y: number): boolean {
        if (!this.hasNextLocalMinima(index)) {
            return false;
        }

        const edge = this.at(index);

        return edge.top.y === y;
    }

    public getMaxima(index: number, y: number): boolean {
        if (this.hasNextLocalMinima(index)) {
            return false;
        }

        const edge = this.at(index);

        return edge.top.y === y;
    }

    public swapSides(edge1Index: number, edge2Index: number): void {
        const edge1 = this.at(edge1Index);
        const edge2 = this.at(edge2Index);
        const side: DIRECTION = edge1.side;
        edge1.side = edge2.side;
        edge2.side = side;
    }

    public swapSidesAndIndeces(edge1Index: number, edge2Index: number): void {
        const edge1 = this.at(edge1Index);
        const edge2 = this.at(edge2Index);
        const side: DIRECTION = edge1.side;
        const outIdx: number = edge1.index;
        edge1.side = edge2.side;
        edge2.side = side;
        edge1.index = edge2.index;
        edge2.index = outIdx;
    }


    public updateIndexAEL(edgeIndex: number, side: DIRECTION, oldIndex: number, newIndex: number): void {
        let currentIndex: number = edgeIndex;

        while (currentIndex !== UNASSIGNED) {
            const edge = this.at(currentIndex);

            if (edge.index === oldIndex) {
                edge.index = newIndex;
                edge.side = side;
                break;
            }

            currentIndex = this.nextActive(currentIndex);
        }
    }

    public getHoleState(firstLeftIndex: number, edgeIndex: number): { isHole: boolean, index: number } {
        let isHole: boolean = false;
        let currentIndex: number = this.prevActive(edgeIndex);
        let index: number = UNASSIGNED;

        while (currentIndex !== UNASSIGNED) {
            const edge = this.at(currentIndex);
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
                isHole = !isHole;

                if (firstLeftIndex === UNASSIGNED) {
                    index = edge.index;
                }
            }

            currentIndex = this.prevActive(currentIndex);
        }

        return { isHole, index };
    }

    public swapEdges(clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE, e1Wc: number, e2Wc: number, edge1Index: number, edge2Index: number): boolean {
        const edge1 = this.at(edge1Index);
        const edge2 = this.at(edge2Index);
        let e1Wc2: number = 0;
        let e2Wc2: number = 0;

        switch (fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                e1Wc2 = edge1.windCount2;
                e2Wc2 = edge2.windCount2;
                break;
            case POLY_FILL_TYPE.NEGATIVE:
                e1Wc2 = -edge1.windCount2;
                e2Wc2 = -edge2.windCount2;
                break;
            default:
                e1Wc2 = Math.abs(edge1.windCount2);
                e2Wc2 = Math.abs(edge2.windCount2);
                break;
        }

        if (edge1.polyTyp !== edge2.polyTyp) {
            return true;
        }

        if (e1Wc === 1 && e2Wc === 1) {
            switch (clipType) {
                case CLIP_TYPE.UNION:
                    return e1Wc2 <= 0 && e2Wc2 <= 0;
                case CLIP_TYPE.DIFFERENCE:
                    return (
                        (edge1.polyTyp === POLY_TYPE.CLIP && Math.min(e1Wc2, e2Wc2) > 0) ||
                        (edge1.polyTyp === POLY_TYPE.SUBJECT && Math.max(e1Wc2, e2Wc2) <= 0)
                    );
                default:
                    return false;
            }
        }

        this.swapSides(edge1Index, edge2Index);

        return false;
    }

    public intersectPoint(edge1Index: number, edge2Index: number, intersectPoint: PointI32): boolean {
        //nb: with very large coordinate values, it's possible for SlopesEqual() to
        //return false but for the edge.Dx value be equal due to double precision rounding.
        const edge1 = this.at(edge1Index);
        const edge2 = this.at(edge2Index);
        if (this.slopesEqual(edge1Index, edge2Index) || edge1.dx === edge2.dx) {
            const point: Point<Int32Array> = edge2.bot.y > edge1.bot.y ? edge2.bot : edge1.bot;

            intersectPoint.update(point);

            return false;
        }

        if (edge1.delta.x === 0) {
            intersectPoint.set(
                edge1.bot.x,
                edge2.isHorizontal ? edge2.bot.y : clipperRound((edge1.bot.x - edge2.bot.x) / edge2.dx + edge2.bot.y)
            );
        } else if (edge2.delta.x === 0) {
            intersectPoint.set(
                edge2.bot.x,
                edge1.isHorizontal ? edge1.bot.y : clipperRound((edge2.bot.x - edge1.bot.x) / edge1.dx + edge1.bot.y)
            );
        } else {
            const b1 = edge1.bot.x - edge1.bot.y * edge1.dx;
            const b2 = edge2.bot.x - edge2.bot.y * edge2.dx;
            const q: number = (b2 - b1) / (edge1.dx - edge2.dx);

            intersectPoint.set(
                Math.abs(edge1.dx) < Math.abs(edge2.dx) ? clipperRound(edge1.dx * q + b1) : clipperRound(edge2.dx * q + b2),
                clipperRound(q)
            );
        }

        if (intersectPoint.y < edge1.top.y || intersectPoint.y < edge2.top.y) {
            if (edge1.top.y > edge2.top.y) {
                intersectPoint.set(edge2.topX(edge1.top.y), edge1.top.y);

                return intersectPoint.x < edge1.top.x;
            }

            intersectPoint.set(
                Math.abs(edge1.dx) < Math.abs(edge2.dx) ? edge1.topX(intersectPoint.y) : edge2.topX(intersectPoint.y),
                edge2.top.y
            );
        }

        return true;
    }

    public canJoinLeft(index: number): boolean {
        const edge = this.at(index);

        if (!edge.isFilled || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevEdge = this.at(this.prevActive(index));

        return prevEdge.curr.x === edge.bot.x && prevEdge.isFilled &&
            this.slopesEqual(this.prevActive(index), index);
    }

    public canJoinRight(index: number): boolean {
        const edge = this.at(index);

        if (!edge.isFilled || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevEdge = this.at(this.prevActive(index));

        return prevEdge.isFilled && this.slopesEqual(this.prevActive(index), index);
    }

    public canAddScanbeam(index: number): boolean {
        const edge = this.at(index);
        if (!edge.isFilled || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevEdge = this.at(this.prevActive(index));

        return prevEdge.isFilled && prevEdge.curr.x === edge.curr.x
    }

    public nextNeighboar(index: number, isAel: boolean): number {
        return this.getNeighboar(index, true, isAel);
    }

    public prevNeighboar(index: number, isAel: boolean): number {
        return this.getNeighboar(index, false, isAel);
    }

    public nextActive(index: number): number {
        return this.nextNeighboar(index, true);
    }

    public prevActive(index: number): number {
        return this.prevNeighboar(index, true);
    }

    public nextSorted(index: number): number {
        return this.nextNeighboar(index, false);
    }

    public prevSorted(index: number): number {
        return this.prevNeighboar(index, false);
    }

    public setNextActive(index: number, value: number): void {
        this.setNeighboar(index, true, true, value);
    }

    public setPrevActive(index: number, value: number): void {
        this.setNeighboar(index, false, true, value);
    }

    private getNeighboarIndex(isNext: boolean, isAel: boolean) {
        const index = isNext ? 3 : 4;
        const offset = isAel ? 2 : 0;

        return index + offset;
    }

    public getNeighboar(index: number, isNext: boolean, isAel: boolean): number {
        if (!this.getIndexValid(index)) {
            return UNASSIGNED;
        }

        const dataIndex: number = this.getNeighboarIndex(isNext, isAel);

        return this._edgeData[index][dataIndex];
    }

    public setNeighboar(index: number, isNext: boolean, isAel: boolean, value: number): void {
        if (!this.getIndexValid(index)) {
            return;
        }

        const dataIndex: number = this.getNeighboarIndex(isNext, isAel);

        this._edgeData[index][dataIndex] = value;
    }

    private getSwapPositionInEL(edge1Index: number, edge2Index: number, isAel: boolean): boolean {
        //check that one or other edge hasn't already been removed from EL ...
        const nextIndex1 = this.nextNeighboar(edge1Index, isAel);
        const nextIndex2 = this.nextNeighboar(edge2Index, isAel);
        const prevIndex1 = this.prevNeighboar(edge1Index, isAel);
        const prevIndex2 = this.prevNeighboar(edge2Index, isAel);
        const isRemoved: boolean = isAel
            ? nextIndex1 === prevIndex1 || nextIndex2 === prevIndex2
            : (nextIndex1 === UNASSIGNED && prevIndex1 === UNASSIGNED) || (nextIndex2 === UNASSIGNED && prevIndex2 === UNASSIGNED);

        if (isRemoved) {
            return false;
        }

        if (nextIndex1 === edge2Index) {
            if (nextIndex2 !== UNASSIGNED) {
                this.setNeighboar(nextIndex2, false, isAel, edge1Index);
            }

            if (prevIndex1 !== UNASSIGNED) {
                this.setNeighboar(prevIndex1, true, isAel, edge2Index);
            }

            this.setNeighboar(edge2Index, false, isAel, prevIndex1);
            this.setNeighboar(edge2Index, true, isAel, edge1Index);
            this.setNeighboar(edge1Index, false, isAel, edge2Index);
            this.setNeighboar(edge1Index, true, isAel, nextIndex2);

            return true;
        }

        if (nextIndex2 === edge1Index) {
            if (nextIndex1 !== UNASSIGNED) {
                this.setNeighboar(nextIndex1, false, isAel, edge2Index);
            }

            if (prevIndex2 !== UNASSIGNED) {
                this.setNeighboar(prevIndex2, true, isAel, edge1Index);
            }

            this.setNeighboar(edge1Index, false, isAel, prevIndex2);
            this.setNeighboar(edge1Index, true, isAel, edge2Index);
            this.setNeighboar(edge2Index, false, isAel, edge1Index);
            this.setNeighboar(edge2Index, true, isAel, nextIndex1);

            return true;
        }

        this.setNeighboar(edge1Index, true, isAel, nextIndex2);

        if (nextIndex2 !== UNASSIGNED) {
            this.setNeighboar(nextIndex2, false, isAel, edge1Index);
        }

        this.setNeighboar(edge1Index, false, isAel, prevIndex2);

        if (prevIndex2 !== UNASSIGNED) {
            this.setNeighboar(prevIndex2, false, isAel, edge1Index);
        }

        this.setNeighboar(edge2Index, true, isAel, nextIndex1);

        if (edge1Index !== UNASSIGNED) {
            this.setNeighboar(nextIndex1, false, isAel, edge2Index);
        }

        this.setNeighboar(edge2Index, false, isAel, prevIndex1);

        if (prevIndex1 !== UNASSIGNED) {
            this.setNeighboar(prevIndex1, true, isAel, edge2Index);
        }

        return true;
    }

    public insertEdgeIntoAEL(index: number, activeEdgeIndex: number, startEdgeIndex: number = UNASSIGNED): number {
        if (activeEdgeIndex === UNASSIGNED) {
            this.setPrevActive(index, UNASSIGNED);
            this.setNextActive(index, UNASSIGNED);

            return index;
        }

        if (startEdgeIndex === UNASSIGNED && this.insertsBefore(index, activeEdgeIndex)) {
            this.setPrevActive(index, UNASSIGNED);
            this.setNextActive(index, activeEdgeIndex);

            this.setNeighboar(activeEdgeIndex, false, true, index);

            return index;
        }

        let edgeIndex: number = startEdgeIndex === UNASSIGNED ? activeEdgeIndex : startEdgeIndex;
        let nextIndex: number = this.nextActive(edgeIndex);

        while (nextIndex !== UNASSIGNED && !this.insertsBefore(index, nextIndex)) {
            edgeIndex = nextIndex;
            nextIndex = this.nextActive(edgeIndex);
        }

        this.setNextActive(index, nextIndex);

        if (nextIndex !== UNASSIGNED) {
            this.setNeighboar(nextIndex, false, true, index);
        }

        this.setPrevActive(index, edgeIndex);
        this.setNeighboar(edgeIndex, true, true, index);

        return activeEdgeIndex;
    }

    public addEdgeToSEL(index: number, sortedEdgeIndex: number): number {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        this.setNeighboar(index, false, false, UNASSIGNED);
        this.setNeighboar(index, true, false, sortedEdgeIndex);

        if (sortedEdgeIndex !== UNASSIGNED) {
            this.setNeighboar(sortedEdgeIndex, false, false, index);
        }

        return index;
    }

    public setWindingCount(index: number, activeEdgeIndex: number, clipType: CLIP_TYPE): void {
        const inputEdge = this.at(index);
        let edgeIndex: number = this.prevActive(index);
        let edge = this.at(edgeIndex);
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (edgeIndex !== UNASSIGNED && (edge.polyTyp !== inputEdge.polyTyp || edge.isWindDeletaEmpty)) {
            edgeIndex = this.prevActive(edgeIndex);
            edge = this.at(edgeIndex);
        }

        if (edgeIndex === UNASSIGNED) {
            inputEdge.windCount1 = inputEdge.isWindDeletaEmpty ? 1 : inputEdge.windDelta;
            inputEdge.windCount2 = 0;
            edgeIndex = activeEdgeIndex;
            //ie get ready to calc WindCnt2
        } else if (inputEdge.isWindDeletaEmpty && clipType !== CLIP_TYPE.UNION) {
            inputEdge.windCount1 = 1;
            inputEdge.windCount2 = edge.windCount2;
            edgeIndex = this.nextActive(edgeIndex);
            //ie get ready to calc WindCnt2
        } else {
            edge = this.at(edgeIndex);
            //nonZero, Positive or Negative filling ...
            if (edge.windCount1 * edge.windDelta < 0) {
                //prev edge is 'decreasing' WindCount (WC) toward zero
                //so we're outside the previous polygon ...
                if (Math.abs(edge.windCount1) > 1) {
                    //outside prev poly but still inside another.
                    //when reversing direction of prev poly use the same WC
                    inputEdge.windCount1 = edge.windDelta * inputEdge.windDelta < 0 ? edge.windCount1 : edge.windCount1 + inputEdge.windDelta;
                } else {
                    inputEdge.windCount1 = inputEdge.isWindDeletaEmpty ? 1 : inputEdge.windDelta;
                }
            } else {
                //prev edge is 'increasing' WindCount (WC) away from zero
                //so we're inside the previous polygon ...
                if (inputEdge.isWindDeletaEmpty) {
                    inputEdge.windCount1 = edge.windCount1 < 0 ? edge.windCount1 - 1 : edge.windCount1 + 1;
                } else {
                    inputEdge.windCount1 = edge.windDelta * inputEdge.windDelta < 0 ? edge.windCount1 : edge.windCount1 + inputEdge.windDelta;
                }
            }

            inputEdge.windCount2 = edge.windCount2;
            edgeIndex = this.nextActive(edge.current);
            //ie get ready to calc WindCnt2
        }
        //nonZero, Positive or Negative filling ...
        while (edgeIndex !== inputEdge.current) {
            edge = this.at(edgeIndex);
            inputEdge.windCount2 += edge.windDelta;
            edgeIndex = this.nextActive(edgeIndex);
        }
    }

    public insertsBefore(index: number, edgeIndex: number): boolean {
        const inputEdge = this.at(index);
        const edge = this.at(edgeIndex);

        if (inputEdge.curr.x === edge.curr.x) {
            return inputEdge.top.y > edge.top.y ? inputEdge.top.x < edge.topX(inputEdge.top.y) : edge.top.x > inputEdge.topX(edge.top.y);
        }

        return inputEdge.curr.x < edge.curr.x;
    }

    public alignWndCount(index1: number, index2: number): void {
        const edge1 = this.at(index1);
        const edge2 = this.at(index2);

        if (edge1.polyTyp === edge2.polyTyp) {
            edge1.windCount1 = edge1.windCount1 === -edge2.windDelta ? -edge1.windCount1 : edge1.windCount1 + edge2.windDelta;
            edge2.windCount1 = edge2.windCount1 === edge1.windDelta ? -edge2.windCount1 : edge2.windCount1 - edge1.windDelta;
        } else {
            edge1.windCount2 += edge2.windDelta;
            edge2.windCount2 -= edge1.windDelta;
        }
    }

    public checkMinJoin(index: number, edgePrevIndex: number, point: Point<Int32Array>): boolean {
        const edge = this.at(index);
        const edgePrev = this.at(edgePrevIndex);

        return edgePrevIndex !== UNASSIGNED &&
            edgePrev.isFilled &&
            edgePrev.topX(point.y) === edge.topX(point.y) &&
            this.slopesEqual(index, edgePrevIndex) &&
            !edge.isWindDeletaEmpty;
    }

    public checkHorizontalCondition(index: number, isNext: boolean): boolean {
        const neighboarIndex = this.getNeighboar(index, isNext, true);

        if (neighboarIndex === UNASSIGNED || !this.slopesEqual(index, neighboarIndex)) {
            return false;
        }

        const edge = this.at(index);
        const neighboar = this.at(neighboarIndex);

        return neighboar.curr.almostEqual(edge.bot) && neighboar.isFilled && neighboar.curr.y > neighboar.top.y;
    }

    public checkSharedCondition(index: number, outHash: number, isNext: boolean): boolean {
        const edge = this.at(index);

        return outHash !== UNASSIGNED && this.checkHorizontalCondition(index, isNext) && !edge.isWindDeletaEmpty;
    }

    public updateCurrent(index: number, edgeIndex: number): void {
        const currEdge = this.at(index);
        const edge = this.at(edgeIndex);

        currEdge.side = edge.side;
        currEdge.windDelta = edge.windDelta;
        currEdge.windCount1 = edge.windCount1;
        currEdge.windCount2 = edge.windCount2;
        this.setPrevActive(index, this.prevActive(edgeIndex));
        this.setNextActive(index, this.nextActive(edgeIndex));
        currEdge.curr.update(currEdge.bot);
    }

    public copyActiveToSorted(index: number): number {
        this.setNeighboar(index, false, false, this.prevActive(index));
        this.setNeighboar(index, true, false, this.nextActive(index));

        return this.nextActive(index);
    }

    public slopesEqual(e1Index: number, e2Index: number): boolean {
        const e1 = this.at(e1Index);
        const e2 = this.at(e2Index);
        return slopesEqual(e1.delta.y, e2.delta.x, e1.delta.x, e2.delta.y, this._isUseFullRange);
    }

    public copyAELToSEL(): void {
        this.sortedEdges = this.activeEdges;

        let currentIndex = this.activeEdges;
        let edge = this.at(currentIndex);

        while (currentIndex !== UNASSIGNED) {
            currentIndex = this.copyActiveToSorted(edge.current);
            edge = this.at(currentIndex);
        }
    }

    public edgesAdjacent(edge1Index: number, edge2Index: number): boolean {
        return this.nextSorted(edge1Index) === edge2Index || this.prevSorted(edge1Index) === edge2Index;
    }

    private getCurrentEdge(isAel: boolean): number {
        return isAel ? this.activeEdges : this.sortedEdges;
    }

    public swapPositionsInList(edgeIndex1: number, edgeIndex2: number, isAel: boolean): void {
        let edgeIndex = UNASSIGNED;

        if (this.getSwapPositionInEL(edgeIndex1, edgeIndex2, isAel)) {
            if (this.prevNeighboar(edgeIndex1, isAel) === UNASSIGNED) {
                edgeIndex = edgeIndex1;
            } else if (this.prevNeighboar(edgeIndex2, isAel) === UNASSIGNED) {
                edgeIndex = edgeIndex2;
            }
        }

        if (edgeIndex !== UNASSIGNED) {
            this.setCurrentEdge(edgeIndex, isAel);
        }
    }

    private setCurrentEdge(value: number, isAel: boolean): void {
        if (isAel) {
            this.activeEdges = value;
        } else {
            this.sortedEdges = value;
        }
    }

    public deleteFromList(edgeIndex: number, isAel: boolean): void {
        const nextIndex = this.nextNeighboar(edgeIndex, isAel);
        const prevIndex = this.prevNeighboar(edgeIndex, isAel);
        const hasNext = nextIndex !== UNASSIGNED;
        const hasPrev = prevIndex !== UNASSIGNED;

        if (!hasPrev && !hasNext && edgeIndex !== this.getCurrentEdge(isAel)) {
            return;
        }

        //already deleted
        if (hasPrev) {
            this.setNeighboar(prevIndex, true, isAel, nextIndex);
        } else {
            this.setCurrentEdge(nextIndex, isAel);
        }

        if (hasNext) {
            this.setNeighboar(nextIndex, false, isAel, prevIndex);
        }

        this.setNeighboar(edgeIndex, true, isAel, UNASSIGNED);
        this.setNeighboar(edgeIndex, false, isAel, UNASSIGNED);
    }

    public get isUseFullRange(): boolean {
        return this._isUseFullRange;
    }

    public checkReverse(p1: Point<Int32Array>, p2: Point<Int32Array>, p3: Point<Int32Array>): boolean {
        return p2.y > p1.y || !PointI32.slopesEqual(p1, p2, p3, this._isUseFullRange);
    }

    public reset(): void {
        this.activeEdges = UNASSIGNED;
        this.sortedEdges = UNASSIGNED;
    }
}