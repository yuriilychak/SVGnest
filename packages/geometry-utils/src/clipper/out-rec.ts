import Point from '../point';
import { Pt2IsBetweenPt1AndPt3, SlopesEqualPoints } from './helpers';
import OutPt from './out-pt';
import TEdge from './t-edge';

export default class OutRec {
    public Idx: number;
    public IsHole: boolean;
    public IsOpen: boolean;
    public FirstLeft: OutRec;
    public Pts: OutPt | null;
    public BottomPt: OutPt;

    constructor(index: number = 0, isOpen: boolean = false, pointer: OutPt | null = null) {
        this.Idx = index;
        this.IsHole = false;
        this.IsOpen = isOpen;
        this.FirstLeft = null;
        this.Pts = pointer;
        this.BottomPt = null;
    }

    public fixupOutPolygon(preserveCollinear: boolean, useFullRange: boolean): void {
        //FixupOutPolygon() - removes duplicate points and simplifies consecutive
        //parallel edges by removing the middle vertex.
        this.BottomPt = null;
        let lastOutPt: OutPt | null = null;
        let outPt: OutPt | null = this.Pts;

        while (true) {
            if (outPt !== null && (outPt.Prev === outPt || outPt.Prev === outPt.Next)) {
                outPt.dispose();
                this.Pts = null;

                return;
            }
            //test for duplicate points and collinear edges ...
            if (
                outPt.Pt.almostEqual(outPt.Next.Pt) ||
                outPt.Pt.almostEqual(outPt.Prev.Pt) ||
                (SlopesEqualPoints(outPt.Prev.Pt, outPt.Pt, outPt.Next.Pt, useFullRange) &&
                    (!preserveCollinear || !Pt2IsBetweenPt1AndPt3(outPt.Prev.Pt, outPt.Pt, outPt.Next.Pt)))
            ) {
                lastOutPt = null;
                outPt.Prev.Next = outPt.Next;
                outPt.Next.Prev = outPt.Prev;
                outPt = outPt.Prev;

                continue;
            }

            if (outPt == lastOutPt) {
                break;
            }

            if (lastOutPt === null) {
                lastOutPt = outPt;
            }

            outPt = outPt.Next;
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

    public export(): Point[] | null {
        const pointCount = this.pointCount;

        if (pointCount < 2) {
            return null;
        }

        const result: Point[] = new Array(pointCount);
        let outPt: OutPt = this.Pts.Prev as OutPt;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.Pt;
            outPt = outPt.Prev as OutPt;
        }

        return result;
    }

    public updateOutPtIdxs(): void {
        let outPt: OutPt = this.Pts;

        do {
            outPt.Idx = this.Idx;
            outPt = outPt.Prev;
        } while (outPt !== this.Pts);
    }

    public containsPoly(outRec: OutRec): boolean {
        let outPt: OutPt = outRec.Pts;
        let res: number = 0;

        do {
            res = this.Pts.pointIn(outPt.Pt);

            if (res >= 0) {
                return res !== 0;
            }

            outPt = outPt.Next;
        } while (outPt !== outRec.Pts);

        return true;
    }

    public get pointCount(): number {
        return this.Pts !== null && this.Pts.Prev !== null ? this.Pts.Prev.pointCount : 0;
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
            result = result + (outPt.Prev.Pt.x + outPt.Pt.x) * (outPt.Prev.Pt.y - outPt.Pt.y);
            outPt = outPt.Next;
        } while (outPt != this.Pts);

        return result * 0.5;
    }

    public setHoleState = function (inputEdge: TEdge, outs: OutRec[]): void {
        let isHole: boolean = false;
        let edge: TEdge | null = inputEdge.PrevInAEL;

        while (edge !== null) {
            if (edge.OutIdx >= 0 && edge.WindDelta !== 0) {
                isHole = !isHole;

                if (this.FirstLeft === null) {
                    this.FirstLeft = outs[edge.OutIdx];
                }
            }

            edge = edge.PrevInAEL;
        }

        if (isHole) {
            this.IsHole = true;
        }
    };

    public simplify(outPt: OutPt, output: OutRec[]): void {
        let outRec: OutRec = null;
        let op2: OutPt = null;
        let op3: OutPt = null;
        let op4: OutPt = null;

        do //for each Pt in Polygon until duplicate found do ...
        {
            op2 = outPt.Next;

            while (op2 !== this.Pts) {
                if (outPt.Pt.almostEqual(op2.Pt) && op2.Next != outPt && op2.Prev != outPt) {
                    //split the polygon into two ...
                    op3 = outPt.Prev;
                    op4 = op2.Prev;
                    outPt.Prev = op4;
                    op4.Next = outPt;
                    op2.Prev = op3;
                    op3.Next = op2;
                    this.Pts = outPt;
                    outRec = OutRec.create(output);
                    outRec.Pts = op2;
                    outRec.updateOutPtIdxs();

                    if (this.containsPoly(outRec)) {
                        //OutRec2 is contained by OutRec1 ...
                        outRec.IsHole = !this.IsHole;
                        outRec.FirstLeft = this;
                    } else if (outRec.containsPoly(this)) {
                        //OutRec1 is contained by OutRec2 ...
                        outRec.IsHole = this.IsHole;
                        this.IsHole = !outRec.IsHole;
                        outRec.FirstLeft = this.FirstLeft;
                        this.FirstLeft = outRec;
                    } else {
                        //the 2 polygons are separate ...
                        outRec.IsHole = this.IsHole;
                        outRec.FirstLeft = this.FirstLeft;
                    }
                    op2 = outPt;
                    //ie get ready for the next iteration
                }
                op2 = op2.Next;
            }
            outPt = outPt.Next;
        } while (outPt != this.Pts);
    }

    public static param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
        do {
            outRec1 = outRec1.FirstLeft;

            if (outRec1 == outRec2) {
                return true;
            }
        } while (outRec1 !== null);

        return false;
    }

    public static parseFirstLeft(FirstLeft: OutRec): OutRec | null {
        while (FirstLeft != null && FirstLeft.Pts == null) FirstLeft = FirstLeft.FirstLeft;
        return FirstLeft;
    }

    public static create(output: OutRec[], isOpen: boolean = false, pointer: OutPt | null = null): OutRec {
        const result: OutRec = new OutRec(output.length, isOpen, pointer);

        output.push(result);

        return result;
    }
}
