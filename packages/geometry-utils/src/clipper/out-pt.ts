import { Point } from '../types';
import { PointI32 } from '../geometry';
import { HORIZONTAL, UNASSIGNED } from './constants';
import { DIRECTION } from './types';
export default class OutPt {
    private static points: OutPt[] = [];

    public readonly point: Point<Int32Array>;

    public next: number;

    public prev: number;

    public current: number;

    constructor(point: Point<Int32Array>) {
        this.point = PointI32.from(point);
        this.next = UNASSIGNED;
        this.prev = UNASSIGNED;
        this.current = OutPt.points.length;

        OutPt.points.push(this);
    }

    public static at(index: number): OutPt | null {
        return index >= 0 && index < OutPt.points.length ? OutPt.points[index] : null;
    }

    public static cleanup(): void {
        OutPt.points.length = 0;
    }

    public get sameAsNext(): boolean {
        return this.current === this.next;
    }

    public static almostEqual(index1: number, index2: number): boolean {
        if (index1 == UNASSIGNED || index2 == UNASSIGNED) {
            return false;
        }

        const outPt1 = OutPt.at(index1);
        const outPt2 = OutPt.at(index2);

        return outPt1.point.almostEqual(outPt2.point);
    }

    public static getNeighboarIndex(index: number, isNext: boolean): number {
        const outPt = OutPt.at(index);
        
        if (index == UNASSIGNED) {
            return UNASSIGNED;
        }

        return isNext ? outPt.next : outPt.prev;
    }

    public static push(outPt1Index: number, outPt2Index: number, isReverse: boolean): void {
        const outPt1 = OutPt.at(outPt1Index);
        const outPt2 = OutPt.at(outPt2Index);

        if (isReverse) {
            outPt1.next = outPt2Index;
            outPt2.prev = outPt1Index; 
        } else {
            outPt1.prev = outPt2Index;
            outPt2.next = outPt1Index;
        }
    }

    public static fromPoint(point: Point<Int32Array>): number {
        const outPt = new OutPt(point);

        const index = outPt.current;

        OutPt.push(index, index, true);

        return index;
    }
}
