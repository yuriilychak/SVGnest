import { cycle_index_wasm as cycle_index } from 'wasm-nesting';
import { Point } from '../types';
import { UNASSIGNED } from './constants';
import { BoolCondition, ClipType, Direction, EdgeSide, PolyFillType, PolyType } from './enums';
import { PointI32 } from '../geometry';
import { clipperRound, slopesEqual } from '../helpers';
import { showError } from './helpers';

export default class TEdge {
    private _isUseFullRange: boolean = true;
    private _edgeData: Int16Array[] = [];
    private _wind: Int32Array[] = [];
    private _dx: number[] = [];
    private _polyType: PolyType[] = [];
    private _side: Direction[] = [];
    private _points: Point<Int32Array>[][] = [];
    private _clipType: ClipType = ClipType.Union;
    private _fillType: PolyFillType = PolyFillType.NonZero;
    public active: number = UNASSIGNED;
    public sorted: number = UNASSIGNED;

    public init(clipType: ClipType, fillType: PolyFillType): void {
        this._clipType = clipType;
        this._fillType = fillType;
    }

    public createPath(polygon: Point<Int32Array>[], polyType: PolyType): number {
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
        const indices: number[] = [];
        let i: number = 0;

        for (i = 0; i <= lastIndex; ++i) {
            indices.push(this._dx.length);

            this._isUseFullRange = polygon[i].rangeTest(this._isUseFullRange);
            this._edgeData.push(
                new Int16Array([UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED, UNASSIGNED])
            );
            this._dx.push(0);
            this._wind.push(new Int32Array([0, 0, 0]));
            this._polyType.push(polyType);
            this._side.push(Direction.Left);
            this._points.push([PointI32.from(polygon[i]), PointI32.create(), PointI32.create(), PointI32.create()]);
        }

        // 2. Remove duplicate vertices and collinear edges by mutating the edges array
        let changed = true;
        while (changed && indices.length > 2) {
            changed = false;

            for (i = 0; i < indices.length; ++i) {
                const currIndex = indices[i];
                const nextIndex = indices[cycle_index(i, indices.length, 1)];
                const prevIndex = indices[cycle_index(i, indices.length, -1)];

                // Check for duplicate vertices
                if (this.almostEqual(currIndex, nextIndex, EdgeSide.Current, EdgeSide.Current)) {
                    if (indices.length <= 3) {
                        break;
                    }

                    // Remove current edge from array
                    indices.splice(i, 1);
                    changed = true;
                    break;
                }

                // Check for collinear edges
                if (
                    PointI32.slopesEqual(this.curr(prevIndex), this.curr(currIndex), this.curr(nextIndex), this._isUseFullRange)
                ) {
                    if (indices.length <= 3) {
                        break;
                    }

                    // Remove current edge from array
                    indices.splice(i, 1);
                    changed = true;
                    break;
                }
            }
        }

        if (indices.length < 3) {
            return UNASSIGNED;
        }

        // 3. Second stage of edge initialization
        let isFlat: boolean = true;
        const startY = this.getY(indices[0], EdgeSide.Current);
        const edgeCount = indices.length;

        for (i = 0; i < edgeCount; ++i) {
            const currIndex = indices[i];
            const nextIndex = indices[cycle_index(i, indices.length, 1)];

            if (this.checkCondition(currIndex, nextIndex, EdgeSide.Current, EdgeSide.Current, BoolCondition.GreaterOrEqual, false)) {
                this.update(currIndex, currIndex, EdgeSide.Bottom, EdgeSide.Current);
                this.update(currIndex, nextIndex, EdgeSide.Top, EdgeSide.Current);
            } else {
                this.update(currIndex, currIndex, EdgeSide.Top, EdgeSide.Current);
                this.update(currIndex, nextIndex, EdgeSide.Bottom, EdgeSide.Current);
            }

            this.delta(currIndex).update(this.top(currIndex)).sub(this.bot(currIndex));
            this._dx[currIndex] =
                this.delta(currIndex).y === 0 ? Number.MIN_SAFE_INTEGER : this.delta(currIndex).x / this.delta(currIndex).y;

            if (isFlat && this.getY(currIndex, EdgeSide.Current) !== startY) {
                isFlat = false;
            }

            this.setDataIndex(currIndex, 0, indices[cycle_index(i, indices.length, -1)]);
            this.setDataIndex(currIndex, 1, indices[cycle_index(i, indices.length, 1)]);
        }

        // Return the starting edge index if path is valid
        return isFlat ? UNASSIGNED : indices[0];
    }

    public getX(index: number, side: EdgeSide): number {
        return this._points[index][side].x;
    }

    public getY(index: number, side: EdgeSide): number {
        return this._points[index][side].y;
    }

    public checkCondition(index1: number, index2: number, side1: EdgeSide, side2: EdgeSide, condition: BoolCondition, isX: boolean): boolean {
        const value1: number = isX ? this.getX(index1, side1) : this.getY(index1, side1);
        const value2: number = isX ? this.getX(index2, side2) : this.getY(index2, side2);

        switch(condition) {
            case BoolCondition.Unequal:
                return value1 !== value2;
            case BoolCondition.Equal:
                return value1 === value2;
            case BoolCondition.Greater:
                return value1 > value2;
            case BoolCondition.GreaterOrEqual:
                return value1 >= value2;
            case BoolCondition.Less:
                return value1 < value2;
            case BoolCondition.LessOrEqual:
                return value1 <= value2;
            default:
                return false;
        }
    }

    public update(inputIndex: number, updateIndex: number, inputSide: EdgeSide, updateSide: EdgeSide): void {
        const inputPoint = this._points[inputIndex][inputSide];
        const updatePoint = this._points[updateIndex][updateSide];

        inputPoint.update(updatePoint);
    }

    public almostEqual(index1: number, index2: number, side1: EdgeSide, side2: EdgeSide): boolean {
        const point1 = this._points[index1][side1];
        const point2 = this._points[index2][side2];

        return point1.almostEqual(point2);
    }

    public curr(index: number): Point<Int32Array> {
        return this._points[index][0];
    }

    public bot(index: number): Point<Int32Array> {
        return this._points[index][1];
    }

    public top(index: number): Point<Int32Array> {
        return this._points[index][2];
    }

    public dispose(): void {
        this._edgeData.length = 0;
        this._wind.length = 0;
        this._dx.length = 0;
        this._polyType.length = 0;
        this._side.length = 0;
        this._points.length = 0;
    }

    public side(index: number): Direction {
        return this._side[index];
    }

    public createLocalMinima(edgeIndex: number): number[] {
        const prevIndex = this.prev(edgeIndex);
        const isClockwise = this.getClockwise(edgeIndex);
        const y = this.bot(edgeIndex).y;
        const leftBoundIndex = isClockwise ? edgeIndex : prevIndex;
        const rightBoundIndex = isClockwise ? prevIndex : edgeIndex;

        this.setSide(leftBoundIndex, Direction.Left);
        this.setSide(rightBoundIndex, Direction.Right);
        const windDelta = this.next(leftBoundIndex) === rightBoundIndex ? -1 : 1;
        this.setWindDelta(leftBoundIndex, windDelta);
        this.setWindDelta(rightBoundIndex, -windDelta);

        return [y, leftBoundIndex, rightBoundIndex];
    }

    public dx(index: number): number {
        return this._dx[index];
    }

    public findNextLocMin(index: number): number {
        let result: number = index;

        while (true) {
            let prevIndex = this.prev(result);

            while (!this.almostEqual(result, prevIndex, EdgeSide.Bottom, EdgeSide.Bottom) || this.almostEqual(result, result, EdgeSide.Current, EdgeSide.Top)) {
                result = this.next(result);
                prevIndex = this.prev(result);
            }

            if (!this.isDxHorizontal(result) && !this.isDxHorizontal(prevIndex)) {
                break;
            }

            while (this.isDxHorizontal(prevIndex)) {
                result = this.prev(result);
                prevIndex = this.prev(result);
            }

            const edgeIndex = result;

            while (this.isDxHorizontal(result)) {
                result = this.next(result);
                prevIndex = this.prev(result);
            }

            if (this.top(result).y === this.bot(prevIndex).y) {
                continue;
            }

            prevIndex = this.prev(edgeIndex);
            //ie just an intermediate horz.
            if (this.bot(prevIndex).x < this.bot(result).x) {
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

    public horzDirection(index: number): Float64Array {
        return new Float64Array(
            this.bot(index).x < this.top(index).x
                ? [Direction.Right, this.bot(index).x, this.top(index).x]
                : [Direction.Left, this.top(index).x, this.bot(index).x]
        );
    }

    public getStop(index: number, point: Point<Int32Array>, isProtect: boolean): boolean {
        if (isProtect || this.hasNextLocalMinima(index)) {
            return false;
        }

        return this.top(index).almostEqual(point);
    }

    public getIntermediate(index: number, y: number): boolean {
        if (!this.hasNextLocalMinima(index)) {
            return false;
        }

        return this.top(index).y === y;
    }

    public getMaxima(index: number, y: number): boolean {
        if (this.hasNextLocalMinima(index)) {
            return false;
        }

        return this.top(index).y === y;
    }

    public swapSidesAndIndeces(edge1Index: number, edge2Index: number): void {
        const rec1Index: number = this.getRecIndex(edge1Index);
        const rec2Index: number = this.getRecIndex(edge2Index);
        this.setRecIndex(edge1Index, rec2Index);
        this.setRecIndex(edge2Index, rec1Index);
        this.swapSides(edge1Index, edge2Index);
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

    public swapEdges(e1Wc: number, e2Wc: number, edge1Index: number, edge2Index: number): boolean {
        let e1Wc2: number = 0;
        let e2Wc2: number = 0;

        switch (this._fillType) {
            case PolyFillType.Positive:
                e1Wc2 = this.windCount2(edge1Index);
                e2Wc2 = this.windCount2(edge2Index);
                break;
            case PolyFillType.Negative:
                e1Wc2 = -this.windCount2(edge1Index);
                e2Wc2 = -this.windCount2(edge2Index);
                break;
            default:
                e1Wc2 = Math.abs(this.windCount2(edge1Index));
                e2Wc2 = Math.abs(this.windCount2(edge2Index));
                break;
        }

        if (!this.isSamePolyType(edge1Index, edge2Index)) {
            return true;
        }

        if (e1Wc === 1 && e2Wc === 1) {
            switch (this._clipType) {
                case ClipType.Union:
                    return e1Wc2 <= 0 && e2Wc2 <= 0;
                case ClipType.Difference:
                    return (
                        (this._polyType[edge1Index] === PolyType.Clip && Math.min(e1Wc2, e2Wc2) > 0) ||
                        (this._polyType[edge1Index] === PolyType.Subject && Math.max(e1Wc2, e2Wc2) <= 0)
                    );
                default:
                    return false;
            }
        }

        this.swapSides(edge1Index, edge2Index);

        return false;
    }

    public canJoinLeft(index: number): boolean {
        if (!this.isFilled(index) || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevIndex = this.prevActive(index);

        return (
            this.checkCondition(prevIndex, index, EdgeSide.Current, EdgeSide.Bottom, BoolCondition.Equal, true) &&
            this.isFilled(prevIndex) &&
            this.slopesEqual(this.prevActive(index), index)
        );
    }

    public canJoinRight(index: number): boolean {
        if (!this.isFilled(index) || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevIndex = this.prevActive(index);

        return this.isFilled(prevIndex) && this.slopesEqual(prevIndex, index);
    }

    public canAddScanbeam(index: number): boolean {
        if (!this.isFilled(index) || this.prevActive(index) === UNASSIGNED) {
            return false;
        }

        const prevIndex = this.prevActive(index);

        return this.isFilled(prevIndex) && this.checkCondition(prevIndex, index, EdgeSide.Current, EdgeSide.Current, BoolCondition.Equal, true);
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

    public getNextLocalMinima(index: number): number {
        return this.getDataIndex(index, 6);
    }

    public getRecIndex(index: number): number {
        return this.getDataIndex(index, 7);
    }

    public setRecIndex(index: number, value: number): void {
        return this.setDataIndex(index, 7, value);
    }

    public getNeighboar(edgeIndex: number, isNext: boolean, isAel: boolean): number {
        const dataIndex: number = this.getNeighboarIndex(isNext, isAel);

        return this.getDataIndex(edgeIndex, dataIndex);
    }

    public setNeighboar(edgeIndex: number, isNext: boolean, isAel: boolean, value: number): void {
        const dataIndex: number = this.getNeighboarIndex(isNext, isAel);

        this.setDataIndex(edgeIndex, dataIndex, value);
    }

    public isNeighboar(index1: number, index2: number, isAel: boolean): boolean {
        return this.getNeighboar(index1, true, isAel) === index2 ||
            this.getNeighboar(index1, false, isAel) === index2
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

    public isSamePolyType(index1: number, index2: number): boolean {
        return this._polyType[index1] === this._polyType[index2];
    }

    public alignWndCount(index1: number, index2: number): void {
        const edge1WindDelta = this.windDelta(index1);
        const edge2WindDelta = this.windDelta(index2);

        if (this.isSamePolyType(index1, index2)) {
            const edge1WindCount1 = this.windCount1(index1);
            const edge2WindCount1 = this.windCount1(index2);

            this.setWindCount1(
                index1,
                edge1WindCount1 === -edge2WindDelta ? -edge1WindCount1 : edge1WindCount1 + edge2WindDelta
            );
            this.setWindCount1(
                index2,
                edge2WindCount1 === edge1WindDelta ? -edge2WindCount1 : edge2WindCount1 - edge1WindDelta
            );
        } else {
            const edge1WindCount2 = this.windCount2(index1);
            const edge2WindCount2 = this.windCount2(index2);
            this.setWindCount2(index1, edge1WindCount2 + edge2WindDelta);
            this.setWindCount2(index2, edge2WindCount2 - edge1WindDelta);
        }
    }

    public checkHorizontalCondition(index: number, isNext: boolean): boolean {
        const neighboarIndex = this.getNeighboar(index, isNext, true);

        if (neighboarIndex === UNASSIGNED || !this.slopesEqual(index, neighboarIndex)) {
            return false;
        }

        return (
            this.almostEqual(neighboarIndex, index, EdgeSide.Current, EdgeSide.Bottom) &&
            this.isFilled(neighboarIndex) &&
            this.checkCondition(neighboarIndex, neighboarIndex, EdgeSide.Current, EdgeSide.Top, BoolCondition.Greater, false)
        );
    }

    public checkSharedCondition(index: number, outHash: number, isNext: boolean): boolean {
        return outHash !== UNASSIGNED && this.checkHorizontalCondition(index, isNext) && !this.isWindDeletaEmpty(index);
    }

    public copyAELToSEL(): void {
        this.sorted = this.active;

        let currentIndex = this.active;

        while (currentIndex !== UNASSIGNED) {
            currentIndex = this.copyActiveToSorted(currentIndex);
        }
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
            this.curr(edgeIndex).x = this.topX(edgeIndex, topY);
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

    public resetBounds(leftIndex: number, rightIndex: number): void {
        this.resetBound(leftIndex, Direction.Left);
        this.resetBound(rightIndex, Direction.Right);
    }

    public getWndTypeFilled(index: number): number {
        const windCount1 = this.windCount1(index);

        switch (this._fillType) {
            case PolyFillType.Positive:
                return windCount1;
            case PolyFillType.Negative:
                return -windCount1;
            default:
                return Math.abs(windCount1);
        }
    }

    public isFilled(index: number): boolean {
        return this.isAssigned(index) && !this.isWindDeletaEmpty(index);
    }

    public currFromTopX(index: number, y: number): void {
        this.curr(index).set(this.topX(index, y), y);
    }

    public isAssigned(index: number): boolean {
        return this.getRecIndex(index) !== UNASSIGNED;
    }

    public isHorizontal(index: number): boolean {
        return this.delta(index).y === 0;
    }

    public isWindDeletaEmpty(index: number): boolean {
        return this.windDelta(index) === 0;
    }

    public unassign(index: number): void {
        this.setRecIndex(index, UNASSIGNED);
    }

    public getIntersectX(currIndex: number, nextIndex: number, botY: number): number {
        const index = Math.abs(this.dx(currIndex)) > Math.abs(this.dx(nextIndex)) ? nextIndex : currIndex;

        return this.topX(index, botY);
    }

    public getIntersectError(currIndex: number, nextIndex: number, point: Point<Int32Array>): boolean {
        return !this.intersectPoint(currIndex, nextIndex, point) && this.getX(currIndex, EdgeSide.Current) > this.getX(nextIndex, EdgeSide.Current) + 1;
    }

    public intersectLineWithPoly(edge1Index: number, edge2Index: number): boolean {
        return (
            this.isSamePolyType(edge1Index, edge2Index) &&
            this.windDelta(edge1Index) !== this.windDelta(edge2Index) &&
            this._clipType === ClipType.Union
        );
    }

    public intersectLine(edge1Index: number, edge2Index: number): boolean {
        return (
            this.isWindDeletaEmpty(edge1Index) &&
            Math.abs(this.windCount1(edge2Index)) === 1 &&
            (this._clipType !== ClipType.Union || this.windCount2(edge2Index) === 0)
        );
    }

    public isIntermediateHorizontalEnd(currIndex: number, horzIndex: number): boolean {
        return (
            this.checkCondition(currIndex, horzIndex, EdgeSide.Current, EdgeSide.Top, BoolCondition.Equal, true) &&
            this.hasNextLocalMinima(horzIndex) &&
            this.dx(currIndex) < this.dx(this.getNextLocalMinima(horzIndex))
        );
    }

    public insertLocalMinimaIntoAEL(leftBoundIndex: number, rightBoundIndex: number): boolean {
        if (leftBoundIndex === UNASSIGNED) {
            this.insertEdgeIntoAEL(rightBoundIndex);
            this.setWindingCount(rightBoundIndex);

            return this.getContributing(rightBoundIndex);
        }

        if (rightBoundIndex === UNASSIGNED) {
            this.insertEdgeIntoAEL(leftBoundIndex);
            this.setWindingCount(leftBoundIndex);

            return this.getContributing(leftBoundIndex);
        }

        this.insertEdgeIntoAEL(leftBoundIndex);
        this.insertEdgeIntoAEL(rightBoundIndex, leftBoundIndex);
        this.setWindingCount(leftBoundIndex);
        this.setWindCount1(rightBoundIndex, this.windCount1(leftBoundIndex));
        this.setWindCount2(rightBoundIndex, this.windCount2(leftBoundIndex));

        return this.getContributing(leftBoundIndex);
    }

    public addLocalMinPoly(index1: number, index2: number, point: Point<Int32Array>): { condition: boolean; prevIndex: number; top: Point<Int32Array> } {
        this.setRecIndex(index2, this.getRecIndex(index1));
        this.setSide(index2, Direction.Right);
        this.setSide(index1, Direction.Left);

        const prevNeighboar = this.prevActive(index1) === index2 ? index2 : index1;
        const prevIndex = this.prevActive(prevNeighboar);
        const condition = this.checkMinJoin(index1, prevIndex, point);
        const top = this.top(index1);

        return { condition, prevIndex, top };
    }

    public addLocalMaxPoly(firstIndex: number, secondIndex: number): void {
        const firstSide = this.side(firstIndex);
        const OKIdx: number = this.getRecIndex(firstIndex);
        const ObsoleteIdx: number = this.getRecIndex(secondIndex);
        this.unassign(firstIndex);
        //nb: safe because we only get here via AddLocalMaxPoly
        this.unassign(secondIndex);

        this.updateIndexAEL(firstSide, ObsoleteIdx, OKIdx);

    }

    public deleteIntersectAsignment(index: number): void {
        if (!this.isAssigned(index)) {
            this.deleteFromList(index, true);
        } else {
            showError('Error intersecting polylines');
        }
    }

    public getStopped(index: number, point: Point<Int32Array>, isProtect: boolean): boolean {
        return !isProtect && !this.hasNextLocalMinima(index) && this.top(index).almostEqual(point)
    }

    private resetBound(index: number, side: Direction): void {
        if (index === UNASSIGNED) {
            return;
        }

        this.update(index, index, EdgeSide.Current, EdgeSide.Bottom);
        this.setSide(index, side);
        this.setRecIndex(index, UNASSIGNED);
    }

    private topX(index: number, y: number): number {
        //if (edge.Bot === edge.Curr) alert ("edge.Bot = edge.Curr");
        //if (edge.Bot === edge.Top) alert ("edge.Bot = edge.Top");
        return y === this.top(index).y
            ? this.top(index).x
            : this.bot(index).x + clipperRound(this.dx(index) * (y - this.bot(index).y));
    }

    private getContributing(index: number): boolean {
        const isReverse: boolean = this._clipType === ClipType.Difference && this._polyType[index] === PolyType.Clip;
        const windCount1 = this.windCount1(index);
        const windCount2 = this.windCount2(index);

        switch (this._fillType) {
            case PolyFillType.NonZero:
                return Math.abs(windCount1) === 1 && isReverse !== (windCount2 === 0);
            case PolyFillType.Positive:
                return windCount1 === 1 && isReverse !== windCount2 <= 0;
            default:
                return windCount1 === UNASSIGNED && isReverse !== windCount2 >= 0;
        }
    }

    private delta(index: number): Point<Int32Array> {
        return this._points[index][3];
    }

    private setSide(index: number, value: Direction): void {
        if (this.getIndexValid(index)) {
            this._side[index] = value;
        } else {
            showError(`TEdgeController.setSide: index ${index} is out of bounds`);
        }
    }

    private getClockwise(index: number): boolean {
        return this.dx(index) >= this.dx(this.prev(index));
    }

    private isDxHorizontal(index: number): boolean {
        return this.dx(index) === Number.MIN_SAFE_INTEGER;
    }

    private processBound(index: number, isClockwise: boolean): number {
        if (this.isDxHorizontal(index)) {
            //it's possible for adjacent overlapping horz edges to start heading left
            //before finishing right, so ...
            const neighboarIndex = this.baseNeighboar(index, !isClockwise);

            if (this.bot(index).x !== this.bot(neighboarIndex).x) {
                this.reverseHorizontal(index);
            }
        }

        let neighboarIndex = this.baseNeighboar(index, isClockwise);
        let resultIndex = index;

        while (this.top(resultIndex).y === this.bot(neighboarIndex).y) {
            resultIndex = neighboarIndex;
            neighboarIndex = this.baseNeighboar(neighboarIndex, isClockwise);
        }

        if (this.isDxHorizontal(resultIndex)) {
            //nb: at the top of a bound, horizontals are added to the bound
            //only when the preceding edge attaches to the horizontal's left vertex
            //unless a Skip edge is encountered when that becomes the top divide
            let horzNeighboarIndex = this.baseNeighboar(resultIndex, !isClockwise);

            while (this.isDxHorizontal(horzNeighboarIndex)) {
                horzNeighboarIndex = this.baseNeighboar(horzNeighboarIndex, !isClockwise);
            }

            const currNeighboarIndex = this.baseNeighboar(resultIndex, isClockwise);

            if (
                (this.top(horzNeighboarIndex).x === this.top(currNeighboarIndex).x && !isClockwise) ||
                this.top(horzNeighboarIndex).x > this.top(currNeighboarIndex).x
            ) {
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


    private windDelta(index: number): number {
        return this._wind[index][0];
    }

    private setWindDelta(index: number, value: number): void {
        if (this.getIndexValid(index)) {
            this._wind[index][0] = value;
        }
    }

    private windCount1(index: number): number {
        return this._wind[index][1];
    }

    private setWindCount1(index: number, value: number): void {
        if (this.getIndexValid(index)) {
            this._wind[index][1] = value;
        }
    }

    private windCount2(index: number): number {
        return this._wind[index][2];
    }

    private setWindCount2(index: number, value: number): void {
        if (this.getIndexValid(index)) {
            this._wind[index][2] = value;
        }
    }

    private checkReverseHorizontal(edgeIndex: number, index: number, isNext: boolean): boolean {
        if (edgeIndex === index) {
            return false;
        }

        const neighboarIndex = this.baseNeighboar(edgeIndex, isNext);

        return this.isDxHorizontal(edgeIndex) && this.bot(edgeIndex).x !== this.top(neighboarIndex).x;
    }

    private getIndexValid(index: number): boolean {
        return index !== UNASSIGNED && index < this._dx.length;
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

        return this.top(index).almostEqual(this.top(edgeIndex));
    }

    private swapSides(edge1Index: number, edge2Index: number): void {
        const side1: Direction = this.side(edge1Index);
        const side2: Direction = this.side(edge2Index);
        this.setSide(edge1Index, side2);
        this.setSide(edge2Index, side1);
    }

    private updateIndexAEL(side: Direction, oldIndex: number, newIndex: number): void {
        let currentIndex: number = this.active;

        while (currentIndex !== UNASSIGNED) {
            if (this.getRecIndex(currentIndex) === oldIndex) {
                this.setRecIndex(currentIndex, newIndex);
                this.setSide(currentIndex, side);
                break;
            }

            currentIndex = this.nextActive(currentIndex);
        }
    }

    private intersectPoint(edge1Index: number, edge2Index: number, intersectPoint: Point<Int32Array>): boolean {
        //nb: with very large coordinate values, it's possible for SlopesEqual() to
        //return false but for the edge.Dx value be equal due to double precision rounding.
        const dx1 = this.dx(edge1Index);
        const dx2 = this.dx(edge2Index);

        if (this.slopesEqual(edge1Index, edge2Index) || dx1 === dx2) {
            const point: Point<Int32Array> =
                this.bot(edge2Index).y > this.bot(edge1Index).y ? this.bot(edge2Index) : this.bot(edge1Index);

            intersectPoint.update(point);

            return false;
        }

        if (this.delta(edge1Index).x === 0) {
            intersectPoint.set(
                this.bot(edge1Index).x,
                this.isHorizontal(edge2Index)
                    ? this.bot(edge2Index).y
                    : clipperRound((this.bot(edge1Index).x - this.bot(edge2Index).x) / dx2 + this.bot(edge2Index).y)
            );
        } else if (this.delta(edge2Index).x === 0) {
            intersectPoint.set(
                this.bot(edge2Index).x,
                this.isHorizontal(edge1Index)
                    ? this.bot(edge1Index).y
                    : clipperRound((this.bot(edge2Index).x - this.bot(edge1Index).x) / dx1 + this.bot(edge1Index).y)
            );
        } else {
            const b1 = this.bot(edge1Index).x - this.bot(edge1Index).y * dx1;
            const b2 = this.bot(edge2Index).x - this.bot(edge2Index).y * dx2;
            const q: number = (b2 - b1) / (dx1 - dx2);

            intersectPoint.set(
                Math.abs(dx1) < Math.abs(dx2) ? clipperRound(dx1 * q + b1) : clipperRound(dx2 * q + b2),
                clipperRound(q)
            );
        }

        if (intersectPoint.y < this.top(edge1Index).y || intersectPoint.y < this.top(edge2Index).y) {
            if (this.top(edge1Index).y > this.top(edge2Index).y) {
                intersectPoint.set(this.topX(edge2Index, this.top(edge1Index).y), this.top(edge1Index).y);

                return intersectPoint.x < this.top(edge1Index).x;
            }

            intersectPoint.set(
                Math.abs(this.dx(edge1Index)) < Math.abs(this.dx(edge2Index))
                    ? this.topX(edge1Index, intersectPoint.y)
                    : this.topX(edge2Index, intersectPoint.y),
                this.top(edge2Index).y
            );
        }

        return true;
    }

    private nextNeighboar(index: number, isAel: boolean): number {
        return this.getNeighboar(index, true, isAel);
    }

    private prevNeighboar(index: number, isAel: boolean): number {
        return this.getNeighboar(index, false, isAel);
    }

    private reverseHorizontal(index: number): void {
        //swap horizontal edges' top and bottom x's so they follow the natural
        //progression of the bounds - ie so their xbots will align with the
        //adjoining lower edge. [Helpful in the ProcessHorizontal() method.]
        const tmp: number = this.top(index).x;
        this.top(index).x = this.bot(index).x;
        this.bot(index).x = tmp;
    }

    private setPrevActive(index: number, value: number): void {
        this.setNeighboar(index, false, true, value);
    }

    private getNeighboarIndex(isNext: boolean, isAel: boolean) {
        const index = isNext ? 2 : 3;
        const offset = isAel ? 2 : 0;

        return index + offset;
    }

    private baseNeighboar(index: number, isNext: boolean): number {
        const dataIndex = isNext ? 1 : 0;

        return this.getDataIndex(index, dataIndex);
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

    private insertEdgeIntoAEL(index: number, startEdgeIndex: number = UNASSIGNED): void {
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

    private setWindingCount(index: number): void {
        let edgeIndex: number = this.prevActive(index);
        //find the edge of the same polytype that immediately preceeds 'edge' in AEL
        while (edgeIndex !== UNASSIGNED && (!this.isSamePolyType(edgeIndex, index) || this.isWindDeletaEmpty(edgeIndex))) {
            edgeIndex = this.prevActive(edgeIndex);
        }

        if (edgeIndex === UNASSIGNED) {
            this.setWindCount1(index, this.isWindDeletaEmpty(index) ? 1 : this.windDelta(index));
            this.setWindCount2(index, 0);
            edgeIndex = this.active;
            //ie get ready to calc WindCnt2
        } else if (this.isWindDeletaEmpty(index) && this._clipType !== ClipType.Union) {
            this.setWindCount1(index, 1);
            this.setWindCount2(index, this.windCount2(edgeIndex));
            edgeIndex = this.nextActive(edgeIndex);
            //ie get ready to calc WindCnt2
        } else {
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
            this.setWindCount2(index, this.windCount2(index) + this.windDelta(edgeIndex));
            edgeIndex = this.nextActive(edgeIndex);
        }
    }

    private insertsBefore(index1: number, index2: number): boolean {
        
        if (this.checkCondition(index1, index2, EdgeSide.Current, EdgeSide.Current, BoolCondition.Equal, true)) {
            return this.checkCondition(index1, index2, EdgeSide.Top, EdgeSide.Top, BoolCondition.Greater, false)
                ? this.top(index1).x < this.topX(index2, this.top(index1).y)
                : this.top(index2).x > this.topX(index1, this.top(index2).y);
        }

        return this.checkCondition(index1, index2, EdgeSide.Current, EdgeSide.Current, BoolCondition.Less, true);
    }

    private checkMinJoin(currIndex: number, prevIndex: number, point: Point<Int32Array>): boolean {
        return (
            prevIndex !== UNASSIGNED &&
            this.isFilled(prevIndex) &&
            this.topX(prevIndex, point.y) === this.topX(currIndex, point.y) &&
            this.slopesEqual(currIndex, prevIndex) &&
            !this.isWindDeletaEmpty(currIndex)
        );
    }

    private slopesEqual(e1Index: number, e2Index: number): boolean {
        return slopesEqual(
            this.delta(e1Index).y,
            this.delta(e2Index).x,
            this.delta(e1Index).x,
            this.delta(e2Index).y,
            this._isUseFullRange
        );
    }

    private updateCurrent(index: number, edgeIndex: number): void {
        this.setSide(index, this.side(edgeIndex));
        this.setWindDelta(index, this.windDelta(edgeIndex));
        this.setWindCount1(index, this.windCount1(edgeIndex));
        this.setWindCount2(index, this.windCount2(edgeIndex));
        this.setPrevActive(index, this.prevActive(edgeIndex));
        this.setNextActive(index, this.nextActive(edgeIndex));
        this.update(index, index, EdgeSide.Current, EdgeSide.Bottom);
    }

    private copyActiveToSorted(index: number): number {
        this.setNeighboar(index, false, false, this.prevActive(index));
        this.setNeighboar(index, true, false, this.nextActive(index));

        return this.nextActive(index);
    }

    private getCurrentEdge(isAel: boolean): number {
        return isAel ? this.active : this.sorted;
    }

    private setCurrentEdge(value: number, isAel: boolean): void {
        if (isAel) {
            this.active = value;
        } else {
            this.sorted = value;
        }
    }
}
