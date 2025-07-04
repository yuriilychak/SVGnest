import { PointI32 } from '../geometry';
import OutPt from './out-pt';
import { NullPtr } from './types';

export default class OutRec {
    public index: number;
    public currentIndex: number;
    public isHole: boolean;
    public isOpen: boolean;
    public firstLeftIndex: number;
    public points: NullPtr<OutPt>;

    constructor(index: number = 0, isOpen: boolean = false, pointer: NullPtr<OutPt> = null) {
        this.index = index;
        this.currentIndex = index;
        this.isHole = false;
        this.isOpen = isOpen;
        this.firstLeftIndex = -1;
        this.points = pointer;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): void {
        this.points = this.points.fixupOutPolygon(preserveCollinear, useFullRange);
    }

    public reversePts(): void {
        if (!this.isPointsEmpty) {
            this.points.reverse();
        }
    }

    public dispose(): void {
        if (!this.isPointsEmpty) {
            this.points.dispose();
        }
    }

    public export(): PointI32[] | null {
        return this.isPointsEmpty ? null : this.points.export();
    }

    public updateOutPtIdxs(): void {
        if(this.points !== null) {
            this.points.updateIndex(this.currentIndex);
        }
    }

    public containsPoly(outRec: OutRec): boolean {
        return this.points.containsPoly(outRec.points);
    }

    public get pointCount(): number {
        return !this.isPointsEmpty && this.points.size;
    }

    public get isPointsEmpty(): boolean {
        return this.points === null;
    }

    public get isEmpty(): boolean {
        return this.isPointsEmpty || this.isOpen;
    }

    public get area(): number {
        return this.isPointsEmpty ? 0 : this.points.area;
    }
}
