import { PointI32 } from '../geometry';
import OutPt from './out-pt';
import { NullPtr } from './types';

export default class OutRec {
    public Idx: number;
    public IsHole: boolean;
    public IsOpen: boolean;
    public FirstLeft: OutRec;
    public Pts: NullPtr<OutPt>;

    constructor(index: number = 0, isOpen: boolean = false, pointer: NullPtr<OutPt> = null) {
        this.Idx = index;
        this.IsHole = false;
        this.IsOpen = isOpen;
        this.FirstLeft = null;
        this.Pts = pointer;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): void {
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        let lastOutPt: NullPtr<OutPt> = null;
        let outPt: NullPtr<OutPt> = this.Pts;

        while (true) {
            if (outPt !== null && (outPt.prev === outPt || outPt.prev === outPt.next)) {
                outPt.dispose();
                this.Pts = null;

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

        this.Pts = outPt;
    }

    public reversePts(): void {
        if (this.Pts !== null) {
            this.Pts.reverse();
        }
    }

    public dispose(): void {
        if (this.Pts !== null) {
            this.Pts.dispose();
        }
    }

    public export(): PointI32[] | null {
        const pointCount = this.pointCount;

        if (pointCount < 2) {
            return null;
        }

        const result: PointI32[] = new Array(pointCount);
        let outPt: OutPt = this.Pts.prev as OutPt;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point;
            outPt = outPt.prev as OutPt;
        }

        return result;
    }

    public updateOutPtIdxs(): void {
        let outPt: OutPt = this.Pts;

        do {
            outPt.index = this.Idx;
            outPt = outPt.prev;
        } while (outPt !== this.Pts);
    }

    public containsPoly(outRec: OutRec): boolean {
        let outPt: OutPt = outRec.Pts;
        let res: number = 0;

        do {
            res = this.Pts.pointIn(outPt.point);

            if (res >= 0) {
                return res !== 0;
            }

            outPt = outPt.next;
        } while (outPt !== outRec.Pts);

        return true;
    }

    public get pointCount(): number {
        return this.Pts !== null && this.Pts.prev !== null ? this.Pts.prev.pointCount : 0;
    }

    public get isEmpty(): boolean {
        return this.Pts === null || this.IsOpen;
    }

    public get area(): number {
        if (this.Pts == null) {
            return 0;
        }

        let outPt: OutPt = this.Pts;
        let result: number = 0;

        do {
            result = result + (outPt.prev.point.x + outPt.point.x) * (outPt.prev.point.y - outPt.point.y);
            outPt = outPt.next;
        } while (outPt != this.Pts);

        return result * 0.5;
    }
}
