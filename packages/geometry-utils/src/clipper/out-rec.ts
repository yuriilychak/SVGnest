import { join_u16_to_u32 } from 'wasm-nesting';
import { Point } from '../types';
import OutPt from './out-pt';
import { DIRECTION, NullPtr } from './types';

export default class OutRec {
    public readonly index: number;
    public currentIndex: number;
    public isHole: boolean;
    public firstLeftIndex: number;
    public points: NullPtr<OutPt>;

    constructor(index: number, pointer: OutPt) {
        this.index = index;
        this.currentIndex = index;
        this.isHole = false;
        this.firstLeftIndex = -1;
        this.points = pointer;
    }

    public simplify(index: number): OutRec[] {
        const result: OutRec[] = [];

        if(this.isEmpty) {
            return result;
        }
        
        const inputOutPt = this.points;
        let innerIndex = index;
        let outPt = inputOutPt;

        do //for each Pt in Polygon until duplicate found do ...
        {
            let op2 = outPt.next;

            while (op2 !== this.points) {
                if (outPt.canSplit(op2)) {
                    //split the polygon into two ...
                    outPt.split(op2);
                    this.points = outPt;
                    let outRec = new OutRec(innerIndex, op2);

                    this.updateSplit(outRec);

                    result.push(outRec);

                    op2 = outPt;

                    ++innerIndex;
                    //ie get ready for the next iteration
                }
                op2 = op2.next;
            }
            outPt = outPt.next;
        } while (outPt != this.points);

        return result;
    }

    public addOutPt(isToFront: boolean, point: Point<Int32Array>): OutPt {
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = this.points;

        if (isToFront && point.almostEqual(op.point)) {
            return op;
        }

        if (!isToFront && point.almostEqual(op.prev.point)) {
            return op.prev;
        }

        const newOp = op.insertBefore(point);

        if (isToFront) {
            this.points = newOp;
        }

        return newOp;
    }

    public postInit(isReverseSolution: boolean): void {
        this.isHole = !this.isHole;
        this.firstLeftIndex = this.index;

        if ((this.isHole !== isReverseSolution) === this.area > 0) {
            this.points.reverse();
        }
    }

    public join(outRec2: OutRec, side1: DIRECTION, side2: DIRECTION): void {
        this.points = this.points.join(outRec2.points, side1, side2); 
    }

    public clean(): void {
        this.points = null;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): void {
        this.points = this.points.fixupOutPolygon(preserveCollinear, useFullRange);
    }

    public reversePts(): void {
        if (!this.isEmpty) {
            this.points.reverse();
        }
    }

    public dispose(): void {
        if (!this.isEmpty) {
            this.points.dispose();
        }
    }

    public export(): Point<Int32Array>[] | null {
        return this.isEmpty ? null : this.points.export();
    }

    public containsPoly(outRec: OutRec): boolean {
        return this.points.containsPoly(outRec.points);
    }

    public get pointCount(): number {
        return !this.isEmpty && this.points.size;
    }

    public get isEmpty(): boolean {
        return this.points === null;
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

    public getJoinData(direction: DIRECTION, top: Point<Int32Array>, bottom: Point<Int32Array>): { outPtHash: number, offPoint: Point<Int32Array> } {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        let outPt: NullPtr<OutPt> = this.points;

        if (direction === DIRECTION.RIGHT) {
            outPt = outPt.prev;
        }

        const offPoint = outPt.point.almostEqual(top) ? bottom : top;

        return { outPtHash: join_u16_to_u32(this.index, outPt.index), offPoint };
    }
    
    public get area(): number {
        return this.isEmpty ? 0 : this.points.area;
    }

    public static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        const bPt1: NullPtr<OutPt> = outRec1.points.getBottomPt();
        const bPt2: NullPtr<OutPt> = outRec2.points.getBottomPt();

        switch (true) {
            case bPt1.point.y > bPt2.point.y:
                return outRec1;
            case bPt1.point.y < bPt2.point.y:
                return outRec2;
            case bPt1.point.x < bPt2.point.x:
                return outRec1;
            case bPt1.point.x > bPt2.point.x:
                return outRec2;
            case bPt1.next === bPt1:
                return outRec2;
            case bPt2.next === bPt2:
                return outRec1;
            case OutPt.firstIsBottomPt(bPt1, bPt2):
                return outRec1;
            default:
                return outRec2;
        }
    }
}
