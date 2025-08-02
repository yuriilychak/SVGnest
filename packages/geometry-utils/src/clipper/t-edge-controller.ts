import { cycle_index_wasm as cycle_index } from 'wasm-nesting';
import { Point } from '../types';
import { HORIZONTAL, UNASSIGNED } from './constants';
import TEdge from './t-edge';
import { CLIP_TYPE, DIRECTION, POLY_FILL_TYPE, POLY_TYPE } from './types';
import { PointI32 } from '../geometry';
import { clipperRound, slopesEqual } from '../helpers';
import { showError } from './helpers';

export default class TEdgeController {
    private _edges: TEdge[] = [];
    private _isUseFullRange: boolean = true;
    private _edgeData: Int16Array[] = [];
    private _wind: Int32Array[] = [];
    public active: number = UNASSIGNED;
    public sorted: number = UNASSIGNED;

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

        // Create edges array without any linking
        const edges: TEdge[] = [];
        const indices: number[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            const edge = new TEdge(polygon[i], polyType);

            edges.push(edge);
            indices.push(this._edges.length);

            this._isUseFullRange = edge.curr.rangeTest(this._isUseFullRange);
            this._edges.push(edge);
            this._edgeData.push(
                new Int16Array([UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED])
            );
            this._wind.push(new Int32Array([0, 0, 0]));
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
                    indices.splice(i, 1);
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
                    indices.splice(i, 1);
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
        const edgeCount = edges.length;

        for (i = 0; i < edgeCount; ++i) {
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

            const index = indices[i];
            this.setDataIndex(index, 0, indices[cycle_index(i, edges.length, -1)]);
            this.setDataIndex(index, 1, indices[cycle_index(i, edges.length, 1)]);
        }

        // Return the starting edge index if path is valid
        return isFlat ? UNASSIGNED : indices[0];
    }

    public at(index: number): TEdge | null {
        return this.getIndexValid(index) ? this._edges[index] : null;
    }

    public dispose(): void {
        this._edges.length = 0;
        this._edgeData.length = 0;
        this._wind.length = 0;
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
        const windDelta = this.next(leftBoundIndex) === rightBoundIndex ? -1 : 1;
        this.setWindDelta(leftBoundIndex, windDelta);
        this.setWindDelta(rightBoundIndex, -windDelta);

        return [y, leftBoundIndex, rightBoundIndex];
    }

    public isDxHorizontal(index: number): boolean {
        const edge = this.at(index);

        return edge.dx === HORIZONTAL;
    }

    public findNextLocMin(index: number): number {
        let result: number = index;

        while (true) {
            let prevIndex = this.prev(result);
            let currEdge = this.at(result);
            let prevEdge = this.at(prevIndex);

            while (!currEdge.bot.almostEqual(prevEdge.bot) || currEdge.curr.almostEqual(currEdge.top)) {
                result = this.next(result);
                currEdge = this.at(result);
                prevIndex = this.prev(result);
                prevEdge = this.at(prevIndex);
            }

            if (!this.isDxHorizontal(result) && !this.isDxHorizontal(prevIndex)) {
                break;
            }

            while (this.isDxHorizontal(prevIndex)) {
                result = this.prev(result);
                currEdge = this.at(result);
                prevIndex = this.prev(result);
            }

            const edgeIndex = result;

            while (this.isDxHorizontal(result)) {
                result = this.next(result);
                currEdge = this.at(result);
                prevIndex = this.prev(result);
            }

            prevEdge = this.at(prevIndex);

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

        return result === UNASSIGNED || (this.nextActive(result) === this.prevActive(result) && !this.isHorizontal(result))
            ? UNASSIGNED
            : result;
    }

    public hasNextLocalMinima(index: number): boolean {
        return this.getNextLocalMinima(index) !== UNASSIGNED;
    }

    public processBound(index: number, isClockwise: boolean): number {
        let edge = this.at(index);
        let result = edge;

        if (this.isDxHorizontal(index)) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const neighboarIndex = this.baseNeighboar(index, !isClockwise);
            const neighboar = this.at(neighboarIndex);

            if (edge.bot.x !== neighboar.bot.x) {
                this.reverseHorizontal(index);
            }
        }

        let neighboarIndex = this.baseNeighboar(index, isClockwise);
        let neighboar = this.at(neighboarIndex);
        let resultIndex = index;

        while (result.top.y === neighboar.bot.y) {
            result = neighboar;
            resultIndex = neighboarIndex;
            neighboarIndex = this.baseNeighboar(neighboarIndex, isClockwise);
            neighboar = this.at(neighboarIndex);
        }

        if (this.isDxHorizontal(resultIndex)) {
            //nb: at the top of a bound, horizontals are added to the bound
            //only when the preceding edge attaches to the horizontal's left vertex
            //unless a Skip edge is encountered when that becomes the top divide
            let horzNeighboarIndex = this.baseNeighboar(resultIndex, !isClockwise);
            let horzNeighboar = this.at(horzNeighboarIndex);

            while (this.isDxHorizontal(horzNeighboarIndex)) {
                horzNeighboarIndex = this.baseNeighboar(horzNeighboarIndex, !isClockwise);
                horzNeighboar = this.at(horzNeighboarIndex);
            }

            const currNeighboarIndex = this.baseNeighboar(resultIndex, isClockwise);
            const currNeighboar = this.at(currNeighboarIndex);

            if ((horzNeighboar.top.x === currNeighboar.top.x && !isClockwise) || horzNeighboar.top.x > currNeighboar.top.x) {
                result = horzNeighboar;
                resultIndex = horzNeighboarIndex;
            }
        }

        let edgeIndex = index;

        while (edgeIndex !== resultIndex) {
            const localMinima = this.baseNeighboar(edgeIndex, isClockwise);
            this.setNextLocalMinima(edgeIndex, localMinima);

            if (this.checkReverseHorizontal(edgeIndex, index, !isClockwise)) {
                this.reverseHorizontal(edgeIndex);
            }

            edgeIndex = localMinima;
        }

        if (this.checkReverseHorizontal(edgeIndex, index, !isClockwise)) {
            this.reverseHorizontal(edgeIndex);
        }

        return this.baseNeighboar(resultIndex, isClockwise);
        //move to the edge just beyond current bound
    }

    public horzDirection(index: number): Float64Array {
        const edge = this.at(index);

        return new Float64Array(
            edge.bot.x < edge.top.x ? [DIRECTION.RIGHT, edge.bot.x, edge.top.x] : [DIRECTION.LEFT, edge.top.x, edge.bot.x]
        );
    }

    public windDelta(index: number): number {
        return this._wind[index][0];
    }

    public setWindDelta(index: number, value: number): void {
        if (this.getIndexValid(index)) {
            this._wind[index][0] = value;
        }
    }

    public windCount1(index: number): number {
        return this._wind[index][1];
    }

    public setWindCount1(index: number, value: number): void {
        if (this.getIndexValid(index)) {
            this._wind[index][1] = value;
        }
    }

    public windCount2(index: number): number {
        return this._wind[index][2];
    }

    public setWindCount2(index: number, value: number): void {
        if (this.getIndexValid(index)) {
            this._wind[index][2] = value;
        }
    }

    private checkReverseHorizontal(edgeIndex: number, index: number, isNext: boolean): boolean {
        if (edgeIndex === index) {
            return false;
        }

        const edge = this.at(edgeIndex);
        const neighboarIndex = this.baseNeighboar(edgeIndex, isNext);
        const neighboar = this.at(neighboarIndex);

        return this.isDxHorizontal(edgeIndex) && edge.bot.x !== neighboar.top.x;
    }

    private getIndexValid(index: number): boolean {
        return index !== UNASSIGNED && index < this._edges.length;
    }

    private next(index: number): number {
        return this.baseNeighboar(index, true);
    }

    private prev(index: number): number {
        return this.baseNeighboar(index, false);
    }

    private checkMaxPair(edgeIndex: number, isNext: boolean): boolean {
        const index = this.baseNeighboar(edgeIndex, isNext);

        if (index === UNASSIGNED || this.hasNextLocalMinima(index)) {
            return false;
        }

        const currEdge = this.at(edgeIndex);
        const edge = this.at(index);

        return edge.top.almostEqual(currEdge.top);
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
        const side1: DIRECTION = edge1.side;
        const side2: DIRECTION = edge2.side;
        const rec1Index: number = this.getRecIndex(edge1Index);
        const rec2Index: number = this.getRecIndex(edge2Index);
        edge1.side = side2;
        edge2.side = side1;
        this.setRecIndex(edge1Index, rec2Index);
        this.setRecIndex(edge2Index, rec1Index);
    }

    public updateIndexAEL(side: DIRECTION, oldIndex: number, newIndex: number): void {
        let currentIndex: number = this.active;

        while (currentIndex !== UNASSIGNED) {
            const edge = this.at(currentIndex);

            if (this.getRecIndex(currentIndex) === oldIndex) {
                this.setRecIndex(currentIndex, newIndex);
                edge.side = side;
                break;
            }

            currentIndex = this.nextActive(currentIndex);
        }
    }

    public getHoleState(firstLeftIndex: number, edgeIndex: number): { isHole: boolean; index: number } {
        let isHole: boolean = false;
        let currentIndex: number = this.prevActive(edgeIndex);
        let index: number = UNASSIGNED;

        while (currentIndex !== UNASSIGNED) {
            if (this.isAssigned(currentIndex) && !this.isWindDeletaEmpty(currentIndex)) {
                isHole = !isHole;

                if (firstLeftIndex === UNASSIGNED) {
                    index = this.getRecIndex(currentIndex);
                }
            }

            currentIndex = this.prevActive(currentIndex);
        }

        return { isHole, index };
    }

    public swapEdges(
        clipType: CLIP_TYPE,
        fillType: POLY_FILL_TYPE,
        e1Wc: number,
        e2Wc: number,
        edge1Index: number,
        edge2Index: number
    ): boolean {
        const edge1 = this.at(edge1Index);
        const edge2 = this.at(edge2Index);
        let e1Wc2: number = 0;
        let e2Wc2: number = 0;

        switch (fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                e1Wc2 = this.windCount2(edge1Index);
                e2Wc2 = this.windCount2(edge2Index);
                break;
            case POLY_FILL_TYPE.NEGATIVE:
                e1Wc2 = -this.windCount2(edge1Index);
                e2Wc2 = -this.windCount2(edge2Index);
                break;
            default:
                e1Wc2 = Math.abs(this.windCount2(edge1Index));
                e2Wc2 = Math.abs(this.windCount2(edge2Index));
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
                this.isHorizontal(edge2Index) ? edge2.bot.y : clipperRound((edge1.bot.x - edge2.bot.x) / edge2.dx + edge2.bot.y)
            );
        } else if (edge2.delta.x === 0) {
            intersectPoint.set(
                edge2.bot.x,
                this.isHorizontal(edge1Index) ? edge1.bot.y : clipperRound((edge2.bot.x - edge1.bot.x) / edge1.dx + edge1.bot.y)
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
                intersectPoint.set(this.topX(edge2Index, edge1.top.y), edge1.top.y);

                return intersectPoint.x < edge1.top.x;
            }

            intersectPoint.set(
                Math.abs(edge1.dx) < Math.abs(edge2.dx)
                    ? this.topX(edge1Index, intersectPoint.y)
                    : this.topX(edge2Index, intersectPoint.y),
                edge2.top.y
            );
        }

        return true;
    }

    public canJoinLeft(index: number): boolean {
        const edge = this.at(index);

        if (!this.isFilled(index) || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevIndex = this.prevActive(index);
        const prevEdge = this.at(prevIndex);

        return prevEdge.curr.x === edge.bot.x && this.isFilled(prevIndex) && this.slopesEqual(this.prevActive(index), index);
    }

    public canJoinRight(index: number): boolean {
        if (!this.isFilled(index) || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevIndex = this.prevActive(index);

        return this.isFilled(prevIndex) && this.slopesEqual(prevIndex, index);
    }

    public canAddScanbeam(index: number): boolean {
        const edge = this.at(index);
        if (!this.isFilled(index) || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevIndex = this.prevActive(index);
        const prevEdge = this.at(prevIndex);

        return this.isFilled(prevIndex) && prevEdge.curr.x === edge.curr.x;
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
        const index = isNext ? 2 : 3;
        const offset = isAel ? 2 : 0;

        return index + offset;
    }

    public getNextLocalMinima(index: number): number {
        return this.getDataIndex(index, 6);
    }

    public getRecIndex(index: number): number {
        return this.getDataIndex(index, 7);
    }

    public setRecIndex(index: number, value: number): void {
        return this.setDataIndex(index, 7, value);
    }

    private baseNeighboar(index: number, isNext: boolean): number {
        const dataIndex = isNext ? 1 : 0;

        return this.getDataIndex(index, dataIndex);
    }

    public getNeighboar(edgeIndex: number, isNext: boolean, isAel: boolean): number {
        const dataIndex: number = this.getNeighboarIndex(isNext, isAel);

        return this.getDataIndex(edgeIndex, dataIndex);
    }

    private getDataIndex(edgeIndex: number, dataIndex: number): number {
        return this.getIndexValid(edgeIndex) ? this._edgeData[edgeIndex][dataIndex] : UNASSIGNED;
    }

    private setDataIndex(edgeIndex: number, dataIndex: number, value: number): void {
        if (!this.getIndexValid(edgeIndex)) {
            return;
        }

        this._edgeData[edgeIndex][dataIndex] = value;
    }

    private setNextLocalMinima(edgeIndex: number, minimaIndex: number): void {
        this.setDataIndex(edgeIndex, 6, minimaIndex);
    }

    public setNeighboar(edgeIndex: number, isNext: boolean, isAel: boolean, value: number): void {
        const dataIndex: number = this.getNeighboarIndex(isNext, isAel);

        this.setDataIndex(edgeIndex, dataIndex, value);
    }

    private getSwapPositionInEL(edge1Index: number, edge2Index: number, isAel: boolean): boolean {
        //check that one or other edge hasn't already been removed from EL ...
        const nextIndex1 = this.nextNeighboar(edge1Index, isAel);
        const nextIndex2 = this.nextNeighboar(edge2Index, isAel);
        const prevIndex1 = this.prevNeighboar(edge1Index, isAel);
        const prevIndex2 = this.prevNeighboar(edge2Index, isAel);
        const isRemoved: boolean = isAel
            ? nextIndex1 === prevIndex1 || nextIndex2 === prevIndex2
            : (nextIndex1 === UNASSIGNED && prevIndex1 === UNASSIGNED) ||
            (nextIndex2 === UNASSIGNED && prevIndex2 === UNASSIGNED);

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

    public insertEdgeIntoAEL(index: number, startEdgeIndex: number = UNASSIGNED): void {
        if (this.active === UNASSIGNED) {
            this.setPrevActive(index, UNASSIGNED);
            this.setNextActive(index, UNASSIGNED);

            this.active = index;
            return;
        }

        if (startEdgeIndex === UNASSIGNED && this.insertsBefore(index, this.active)) {
            this.setPrevActive(index, UNASSIGNED);
            this.setNextActive(index, this.active);

            this.setNeighboar(this.active, false, true, index);

            this.active = index;
            return;
        }

        let edgeIndex: number = startEdgeIndex === UNASSIGNED ? this.active : startEdgeIndex;
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

        return;
    }

    public addEdgeToSEL(index: number): void {
        //SEL pointers in PEdge are reused to build a list of horizontal edges.
        //However, we don't need to worry about order with horizontal edge processing.
        this.setNeighboar(index, false, false, UNASSIGNED);
        this.setNeighboar(index, true, false, this.sorted);

        if (this.sorted !== UNASSIGNED) {
            this.setNeighboar(this.sorted, false, false, index);
        }

        this.sorted = index;
    }

    public setWindingCount(index: number, clipType: CLIP_TYPE): void {
        const inputEdge = this.at(index);
        let edgeIndex: number = this.prevActive(index);
        let edge = this.at(edgeIndex);
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (edgeIndex !== UNASSIGNED && (edge.polyTyp !== inputEdge.polyTyp || this.isWindDeletaEmpty(edgeIndex))) {
            edgeIndex = this.prevActive(edgeIndex);
            edge = this.at(edgeIndex);
        }

        if (edgeIndex === UNASSIGNED) {
            this.setWindCount1(index, this.isWindDeletaEmpty(index) ? 1 : this.windDelta(index));
            this.setWindCount2(index, 0);
            edgeIndex = this.active;
            //ie get ready to calc WindCnt2
        } else if (this.isWindDeletaEmpty(index) && clipType !== CLIP_TYPE.UNION) {
            this.setWindCount1(index, 1);
            this.setWindCount2(index, this.windCount2(edgeIndex));
            edgeIndex = this.nextActive(edgeIndex);
            //ie get ready to calc WindCnt2
        } else {
            edge = this.at(edgeIndex);
            const edgeDelta = this.windDelta(edgeIndex);
            const inputDelta = this.windDelta(index);
            const edgeWindCount1 = this.windCount1(edgeIndex);
            let nextWindCount1 = 0;
            //nonZero, Positive or Negative filling ...
            if (edgeWindCount1 * edgeDelta < 0) {
                //prev edge is 'decreasing' WindCount (WC) toward zero
                //so we're outside the previous polygon ...

                if (Math.abs(edgeWindCount1) > 1) {
                    //outside prev poly but still inside another.
                    //when reversing direction of prev poly use the same WC
                    nextWindCount1 = edgeDelta * inputDelta < 0 ? edgeWindCount1 : edgeWindCount1 + inputDelta;
                } else {
                    nextWindCount1 = this.isWindDeletaEmpty(index) ? 1 : inputDelta;
                }


            } else {
                //prev edge is 'increasing' WindCount (WC) away from zero
                //so we're inside the previous polygon ...
                if (this.isWindDeletaEmpty(index)) {
                    nextWindCount1 = edgeWindCount1 < 0 ? edgeWindCount1 - 1 : edgeWindCount1 + 1;
                } else {
                    nextWindCount1 = edgeDelta * inputDelta < 0 ? edgeWindCount1 : edgeWindCount1 + inputDelta;
                }
            }

            this.setWindCount1(index, nextWindCount1);
            this.setWindCount2(index, this.windCount2(edgeIndex));
            edgeIndex = this.nextActive(edgeIndex);
            //ie get ready to calc WindCnt2
        }
        //nonZero, Positive or Negative filling ...
        while (edgeIndex !== index) {
            edge = this.at(edgeIndex);
            this.setWindCount2(index, this.windCount2(index) + this.windDelta(edgeIndex));
            edgeIndex = this.nextActive(edgeIndex);
        }
    }

    public insertsBefore(index: number, edgeIndex: number): boolean {
        const inputEdge = this.at(index);
        const edge = this.at(edgeIndex);

        if (inputEdge.curr.x === edge.curr.x) {
            return inputEdge.top.y > edge.top.y
                ? inputEdge.top.x < this.topX(edgeIndex, inputEdge.top.y)
                : edge.top.x > this.topX(index, edge.top.y);
        }

        return inputEdge.curr.x < edge.curr.x;
    }

    public alignWndCount(index1: number, index2: number): void {
        const edge1 = this.at(index1);
        const edge2 = this.at(index2);
        const edge1WindDelta = this.windDelta(index1);
        const edge2WindDelta = this.windDelta(index2);

        if (edge1.polyTyp === edge2.polyTyp) {
            const edge1WindCount1 = this.windCount1(index1);
            const edge2WindCount1 = this.windCount1(index2);

            this.setWindCount1(index1, edge1WindCount1 === -edge2WindDelta ? -edge1WindCount1 : edge1WindCount1 + edge2WindDelta);
            this.setWindCount1(index2, edge2WindCount1 === edge1WindDelta ? -edge2WindCount1 : edge2WindCount1 - edge1WindDelta)
        } else {
            const edge1WindCount2 = this.windCount2(index1);
            const edge2WindCount2 = this.windCount2(index2);
            this.setWindCount2(index1, edge1WindCount2 + edge2WindDelta);
            this.setWindCount2(index2, edge2WindCount2 - edge1WindDelta);
        }
    }

    public checkMinJoin(currIndex: number, prevIndex: number, point: Point<Int32Array>): boolean {
        return (
            prevIndex !== UNASSIGNED &&
            this.isFilled(prevIndex) &&
            this.topX(prevIndex, point.y) === this.topX(currIndex, point.y) &&
            this.slopesEqual(currIndex, prevIndex) &&
            !this.isWindDeletaEmpty(currIndex)
        );
    }

    public checkHorizontalCondition(index: number, isNext: boolean): boolean {
        const neighboarIndex = this.getNeighboar(index, isNext, true);

        if (neighboarIndex === UNASSIGNED || !this.slopesEqual(index, neighboarIndex)) {
            return false;
        }

        const edge = this.at(index);
        const neighboar = this.at(neighboarIndex);

        return neighboar.curr.almostEqual(edge.bot) && this.isFilled(neighboarIndex) && neighboar.curr.y > neighboar.top.y;
    }

    public checkSharedCondition(index: number, outHash: number, isNext: boolean): boolean {
        return outHash !== UNASSIGNED && this.checkHorizontalCondition(index, isNext) && !this.isWindDeletaEmpty(index);
    }

    public updateCurrent(index: number, edgeIndex: number): void {
        const currEdge = this.at(index);
        const edge = this.at(edgeIndex);

        currEdge.side = edge.side;
        this.setWindDelta(index, this.windDelta(edgeIndex));
        this.setWindCount1(index, this.windCount1(edgeIndex));
        this.setWindCount2(index, this.windCount2(edgeIndex));
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
        this.sorted = this.active;

        let currentIndex = this.active;

        while (currentIndex !== UNASSIGNED) {
            currentIndex = this.copyActiveToSorted(currentIndex);
        }
    }

    public edgesAdjacent(edge1Index: number, edge2Index: number): boolean {
        return this.nextSorted(edge1Index) === edge2Index || this.prevSorted(edge1Index) === edge2Index;
    }

    private getCurrentEdge(isAel: boolean): number {
        return isAel ? this.active : this.sorted;
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
            this.active = value;
        } else {
            this.sorted = value;
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
        this.active = UNASSIGNED;
        this.sorted = UNASSIGNED;
    }

    public prepareForIntersections(topY: number): boolean {
        if (this.active === UNASSIGNED) {
            return false;
        }
        //prepare for sorting ...
        //console.log(JSON.stringify(JSON.decycle( e )));
        this.sorted = this.active;

        let edgeIndex = this.active;

        while (edgeIndex !== UNASSIGNED) {
            const edge = this.at(edgeIndex);

            edge.curr.x = this.topX(edgeIndex, topY);
            edgeIndex = this.copyActiveToSorted(edgeIndex);
        }

        return true;
    }

    public getLastHorizontal(index: number): number {
        let result = index;

        while (this.hasNextLocalMinima(result) && this.isHorizontal(this.getNextLocalMinima(result))) {
            result = this.getNextLocalMinima(result);
        }

        return result;
    }

    public getMaxPair(index: number): number {
        return this.hasNextLocalMinima(index) ? UNASSIGNED : this.maximaPair(index);
    }

    public processBounds(index: number, leftBound: number, rightBound: number): number {
        const isClockwise = this.getClockwise(index);
        const currIndex = this.processBound(leftBound, isClockwise);
        const nextIndex = this.processBound(rightBound, !isClockwise);

        return isClockwise ? currIndex : nextIndex;
    }

    public updateEdgeIntoAEL(edgeIndex: number): number {
        if (!this.hasNextLocalMinima(edgeIndex)) {
            showError('UpdateEdgeIntoAEL: invalid call');
        }

        const currIndex = this.getNextLocalMinima(edgeIndex);
        const prevIndex = this.prevActive(edgeIndex);
        const nextIndex = this.nextActive(edgeIndex);

        this.setRecIndex(currIndex, this.getRecIndex(edgeIndex));

        if (prevIndex !== UNASSIGNED) {
            this.setNextActive(prevIndex, currIndex);
        } else {
            this.active = currIndex;
        }

        if (nextIndex !== UNASSIGNED) {
            this.setPrevActive(nextIndex, currIndex);
        }

        this.updateCurrent(currIndex, edgeIndex);

        return currIndex;
    }

    private reverseHorizontal(index: number): void {
        const edge = this.at(index);
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        const tmp: number = edge.top.x;
        edge.top.x = edge.bot.x;
        edge.bot.x = tmp;
    }

    public getContributing(index: number, clipType: CLIP_TYPE, fillType: POLY_FILL_TYPE): boolean {
        const edge = this.at(index);
        const isReverse: boolean = clipType === CLIP_TYPE.DIFFERENCE && edge.polyTyp === POLY_TYPE.CLIP;
        const windCount1 = this.windCount1(index);
        const windCount2 = this.windCount2(index);

        switch (fillType) {
            case POLY_FILL_TYPE.NON_ZERO:
                return Math.abs(windCount1) === 1 && isReverse !== (windCount2 === 0);
            case POLY_FILL_TYPE.POSITIVE:
                return windCount1 === 1 && isReverse !== (windCount2 <= 0);
            default:
                return windCount1 === UNASSIGNED && isReverse !== (windCount2 >= 0);
        }
    }

    private resetBound(index: number, side: DIRECTION): void {
        if (index === UNASSIGNED) {
            return;
        }

        const edge = this.at(index);
        edge.curr.update(edge.bot);
        edge.side = side;
        this.setRecIndex(index, UNASSIGNED);
    }

    public resetBounds(leftIndex: number, rightIndex: number): void {
        this.resetBound(leftIndex, DIRECTION.LEFT);
        this.resetBound(rightIndex, DIRECTION.RIGHT);
    }

    public getWndTypeFilled(index: number, fillType: POLY_FILL_TYPE): number {
        const windCount1 = this.windCount1(index);

        switch (fillType) {
            case POLY_FILL_TYPE.POSITIVE:
                return windCount1;
            case POLY_FILL_TYPE.NEGATIVE:
                return -windCount1;
            default:
                return Math.abs(windCount1);
        }
    }

    public isFilled(index: number): boolean {
        return this.isAssigned(index) && !this.isWindDeletaEmpty(index);
    }

    public topX(index: number, y: number): number {
        const edge = this.at(index);
        //if (edge.Bot === edge.Curr) alert ("edge.Bot = edge.Curr");
        //if (edge.Bot === edge.Top) alert ("edge.Bot = edge.Top");
        return y === edge.top.y ? edge.top.x : edge.bot.x + clipperRound(edge.dx * (y - edge.bot.y));
    }

    public isAssigned(index: number): boolean {
        return this.getRecIndex(index) !== UNASSIGNED;
    }

    public isHorizontal(index: number): boolean {
        const edge = this.at(index);

        return edge.delta.y === 0;
    }

    public isWindDeletaEmpty(index: number): boolean {
        return this.windDelta(index) === 0;
    }

    public unassign(index: number): void {
        this.setRecIndex(index, UNASSIGNED);
    }
}
