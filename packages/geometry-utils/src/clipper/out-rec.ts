import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from '../types';
import OutPt from './out-pt';
import { DIRECTION, NullPtr } from './types';

export default class OutRec {
    public readonly index: number;
    public currentIndex: number;
    public isHole: boolean;
    public firstLeftIndex: number;
    private _pointIndex: number;

    constructor(index: number, pointIndex: number) {
        this.index = index;
        this.currentIndex = index;
        this.isHole = false;
        this.firstLeftIndex = -1;
        this._pointIndex = pointIndex;
    }

    public get pointIndex(): number{
        return this._pointIndex;
    }

    public set pointIndex(value: number) {
        this._pointIndex = value;
    }
    
    public getHash(pointIndex: number): number {
        return join_u16_to_u32(this.index, pointIndex);
    }

    public simplify(index: number): OutRec[] {
        const result: OutRec[] = [];

        if(this.isEmpty) {
            return result;
        }
        
        const inputIndex = this._pointIndex;
        let innerIndex = index;
        let currIndex = this._pointIndex;
        let splitIndex = -1;

        do //for each Pt in Polygon until duplicate found do ...
        {
            splitIndex = OutPt.getNeighboarIndex(currIndex, true);

            while (splitIndex !== this._pointIndex) {
                if (OutPt.canSplit(currIndex, splitIndex)) {
                    //split the polygon into two ...
                    OutPt.split(currIndex, splitIndex);
                    this._pointIndex = currIndex;
                    const outRec = new OutRec(innerIndex, splitIndex);

                    this.updateSplit(outRec);

                    result.push(outRec);

                    splitIndex = currIndex;

                    ++innerIndex;
                    //ie get ready for the next iteration
                }

                splitIndex = OutPt.getNeighboarIndex(splitIndex, true);
            }

            currIndex = OutPt.getNeighboarIndex(currIndex, true);
        } while (currIndex != inputIndex);

        return result;
    }

    public addOutPt(isToFront: boolean, point: Point<Int32Array>): number {
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = OutPt.at(this._pointIndex);

        if (isToFront && point.almostEqual(op.point)) {
            return op.current;
        }

        const prev = OutPt.at(op.prev);

        if (!isToFront && point.almostEqual(prev.point)) {
            return prev.current;
        }

        const newIndex = op.insertBefore(point);

        if (isToFront) {
            this._pointIndex = newIndex;
        }

        return newIndex;
    }

    public postInit(isReverseSolution: boolean): void {
        this.isHole = !this.isHole;
        this.firstLeftIndex = this.index;

        if ((this.isHole !== isReverseSolution) === this.area > 0) {
            this.reverse();
        }
    }

    public join(outRec2: OutRec, side1: DIRECTION, side2: DIRECTION): void {
        this._pointIndex = OutPt.join(this._pointIndex, outRec2.pointIndex, side1, side2); 
    }

    public clean(): void {
        this._pointIndex = -1;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): void {
        this._pointIndex = OutPt.fixupOutPolygon(this._pointIndex, preserveCollinear, useFullRange);
    }

    public reverse(): void {
        if (!this.isEmpty) {
            OutPt.reverse(this._pointIndex);
        }
    }

    public export(): Point<Int32Array>[] {
        return this.isEmpty ? [] : OutPt.export(this._pointIndex);
    }

    public containsPoly(outRec: OutRec): boolean {
        return OutPt.containsPoly(this._pointIndex, outRec.pointIndex);
    }

    public get length(): number {
        return !this.isEmpty && OutPt.getLength(this._pointIndex);
    }

    public get isEmpty(): boolean {
        return this._pointIndex === -1;
    }

    public updateSplit(outRec: OutRec): void {
        if (this.containsPoly(outRec)) {
            //OutRec2 is contained by OutRec1 ...
            outRec.isHole = !this.isHole;
            outRec.firstLeftIndex = this.index;
        } else if (outRec.containsPoly(this)) {
            //OutRec1 is contained by OutRec2 ...
            outRec.isHole = this.isHole;
            this.isHole = !outRec.isHole;
            outRec.firstLeftIndex = this.firstLeftIndex;
            this.firstLeftIndex = outRec.index;
        } else {
            //the 2 polygons are separate ...
            outRec.isHole = this.isHole;
            outRec.firstLeftIndex = this.firstLeftIndex;
        }
    }

    public getJoinData(direction: DIRECTION, top: Point<Int32Array>, bottom: Point<Int32Array>): number[] {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        let outPt: NullPtr<OutPt> = OutPt.at(this._pointIndex);

        if (direction === DIRECTION.RIGHT) {
            outPt = OutPt.at(outPt.prev);
        }

        const offPoint = outPt.point.almostEqual(top) ? bottom : top;

        return [this.getHash(outPt.current), offPoint.x, offPoint.y];
    }
    
    public get area(): number {
        return this.isEmpty ? 0 : OutPt.getArea(this._pointIndex);
    }

    public static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        const bIndex1: number = OutPt.getBottomPt(outRec1.pointIndex);
        const bIndex2: number = OutPt.getBottomPt(outRec2.pointIndex);
        const bPt1: OutPt = OutPt.at(bIndex1);
        const bPt2: OutPt = OutPt.at(bIndex2);

        switch (true) {
            case bPt1.point.y > bPt2.point.y:
                return outRec1;
            case bPt1.point.y < bPt2.point.y:
                return outRec2;
            case bPt1.point.x < bPt2.point.x:
                return outRec1;
            case bPt1.point.x > bPt2.point.x:
                return outRec2;
            case bPt1.sameAsNext:
                return outRec2;
            case bPt2.sameAsNext:
                return outRec1;
            case OutPt.firstIsBottomPt(bIndex1, bIndex2):
                return outRec1;
            default:
                return outRec2;
        }
    }
}
