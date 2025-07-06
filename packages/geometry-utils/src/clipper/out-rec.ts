import { PointI32 } from '../geometry';
import OutPt from './out-pt';
import { NullPtr } from './types';

export default class OutRec {
    public index: number;
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

        pointer.updateIndex(this.currentIndex);
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

    public export(): PointI32[] | null {
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
    
    public get area(): number {
        return this.isEmpty ? 0 : this.points.area;
    }
}
