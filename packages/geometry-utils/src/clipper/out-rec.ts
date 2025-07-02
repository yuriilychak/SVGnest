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
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutPt: NullPtr<OutPt> = null;
        let outPt: NullPtr<OutPt> = this.points;

        while (true) {
            if (outPt !== null && (outPt.prev === outPt || outPt.prev === outPt.next)) {
                outPt.dispose();
                this.points = null;

                return;
            }
            //test for duplicate points and collinear edges ...
            if (
                outPt.point.almostEqual(outPt.next.point) ||
                outPt.point.almostEqual(outPt.prev.point) ||
                (PointI32.slopesEqual(outPt.prev.point, outPt.point, outPt.next.point, useFullRange) &&
                    (!preserveCollinear || !outPt.point.getBetween(outPt.prev.point, outPt.next.point)))
            ) {
                lastOutPt = null;
                outPt.prev.next = outPt.next;
                outPt.next.prev = outPt.prev;
                outPt = outPt.prev;

                continue;
            }

            if (outPt == lastOutPt) {
                break;
            }

            if (lastOutPt === null) {
                lastOutPt = outPt;
            }

            outPt = outPt.next;
        }

        this.points = outPt;
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
        const pointCount = this.pointCount;

        if (pointCount < 2) {
            return null;
        }

        const result: PointI32[] = new Array(pointCount);
        let outPt: OutPt = this.points.prev as OutPt;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point;
            outPt = outPt.prev as OutPt;
        }

        return result;
    }

    public updateOutPtIdxs(): void {
        let outPt: OutPt = this.points;

        do {
            outPt.index = this.currentIndex;
            outPt = outPt.prev;
        } while (outPt !== this.points);
    }

    public containsPoly(outRec: OutRec): boolean {
        let outPt: OutPt = outRec.points;
        let res: number = 0;

        do {
            res = this.points.pointIn(outPt.point);

            if (res >= 0) {
                return res !== 0;
            }

            outPt = outPt.next;
        } while (outPt !== outRec.points);

        return true;
    }

    public get pointCount(): number {
        return !this.isPointsEmpty && this.points.prev !== null ? this.points.prev.pointCount : 0;
    }

    public get isPointsEmpty(): boolean {
        return this.points === null;
    }

    public get isEmpty(): boolean {
        return this.isPointsEmpty || this.isOpen;
    }

    public get area(): number {
        if (this.isPointsEmpty) {
            return 0;
        }

        let outPt: OutPt = this.points;
        let result: number = 0;

        do {
            result = result + (outPt.prev.point.x + outPt.point.x) * (outPt.prev.point.y - outPt.point.y);
            outPt = outPt.next;
        } while (outPt != this.points);

        return result * 0.5;
    }
}
