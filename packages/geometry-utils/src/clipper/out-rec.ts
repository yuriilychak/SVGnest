import Point from '../point';
import OutPt from './out-pt';
import TEdge from './t-edge';
import { DIRECTION } from './types';

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
                (Point.slopesEqual(outPt.Prev.Pt, outPt.Pt, outPt.Next.Pt, useFullRange) &&
                    (!preserveCollinear || !outPt.Pt.getBetween(outPt.Prev.Pt, outPt.Next.Pt)))
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

    public setHoleState(inputEdge: TEdge, outs: OutRec[]): void {
        let isHole: boolean = false;
        let edge: TEdge | null = inputEdge.PrevInAEL;

        while (edge !== null) {
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
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
    }

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

    public static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        //work out which polygon fragment has the correct hole state ...
        if (outRec1.BottomPt === null) {
            outRec1.BottomPt = outRec1.Pts.getBottomPt();
        }
        if (outRec2.BottomPt === null) {
            outRec2.BottomPt = outRec2.Pts.getBottomPt();
        }

        const bPt1: OutPt | null = outRec1.BottomPt;
        const bPt2: OutPt | null = outRec2.BottomPt;

        switch (true) {
            case bPt1.Pt.y > bPt2.Pt.y:
                return outRec1;
            case bPt1.Pt.y < bPt2.Pt.y:
                return outRec2;
            case bPt1.Pt.x < bPt2.Pt.x:
                return outRec1;
            case bPt1.Pt.x > bPt2.Pt.x:
                return outRec2;
            case bPt1.Next === bPt1:
                return outRec2;
            case bPt2.Next === bPt2:
                return outRec1;
            case OutPt.firstIsBottomPt(bPt1, bPt2):
                return outRec1;
            default:
                return outRec2;
        }
    }

    public static appendPolygon(records: OutRec[], edge1: TEdge, edge2: TEdge, activeEdge: TEdge): void {
        //get the start and ends of both output polygons ...
        const outRec1: OutRec = records[edge1.OutIdx];
        const outRec2: OutRec = records[edge2.OutIdx];
        let holeStateRec: OutRec | null = null;

        if (OutRec.param1RightOfParam2(outRec1, outRec2)) {
            holeStateRec = outRec2;
        } else if (OutRec.param1RightOfParam2(outRec2, outRec1)) {
            holeStateRec = outRec1;
        } else {
            holeStateRec = OutRec.getLowermostRec(outRec1, outRec2);
        }

        const p1_lft: OutPt = outRec1.Pts;
        const p1_rt: OutPt = p1_lft.Prev;
        const p2_lft: OutPt = outRec2.Pts;
        const p2_rt: OutPt = p2_lft.Prev;
        let side: DIRECTION;
        //join e2 poly onto e1 poly and delete pointers to e2 ...
        if (edge1.Side === DIRECTION.LEFT) {
            if (edge2.Side === DIRECTION.LEFT) {
                //z y x a b c
                p2_lft.reverse();
                p2_lft.Next = p1_lft;
                p1_lft.Prev = p2_lft;
                p1_rt.Next = p2_rt;
                p2_rt.Prev = p1_rt;
                outRec1.Pts = p2_rt;
            } else {
                //x y z a b c
                p2_rt.Next = p1_lft;
                p1_lft.Prev = p2_rt;
                p2_lft.Prev = p1_rt;
                p1_rt.Next = p2_lft;
                outRec1.Pts = p2_lft;
            }
            side = DIRECTION.LEFT;
        } else {
            if (edge2.Side === DIRECTION.RIGHT) {
                //a b c z y x
                p2_lft.reverse();
                p1_rt.Next = p2_rt;
                p2_rt.Prev = p1_rt;
                p2_lft.Next = p1_lft;
                p1_lft.Prev = p2_lft;
            } else {
                //a b c x y z
                p1_rt.Next = p2_lft;
                p2_lft.Prev = p1_rt;
                p1_lft.Prev = p2_rt;
                p2_rt.Next = p1_lft;
            }
            side = DIRECTION.RIGHT;
        }

        outRec1.BottomPt = null;

        if (holeStateRec === outRec2) {
            if (outRec2.FirstLeft !== outRec1) {
                outRec1.FirstLeft = outRec2.FirstLeft;
            }

            outRec1.IsHole = outRec2.IsHole;
        }

        outRec2.Pts = null;
        outRec2.BottomPt = null;
        outRec2.FirstLeft = outRec1;
        const OKIdx: number = edge1.OutIdx;
        const ObsoleteIdx: number = edge2.OutIdx;
        edge1.unassign();
        //nb: safe because we only get here via AddLocalMaxPoly
        edge2.unassign();

        let e: TEdge = activeEdge;

        while (e !== null) {
            if (e.OutIdx === ObsoleteIdx) {
                e.OutIdx = OKIdx;
                e.Side = side;
                break;
            }
            e = e.NextInAEL;
        }

        outRec2.Idx = outRec1.Idx;
    }

    public static addOutPt(records: OutRec[], edge: TEdge, point: Point): OutPt {
        const isToFront: boolean = edge.Side === DIRECTION.LEFT;
        let outRec: OutRec = null;
        let newOp: OutPt = null;

        if (!edge.isAssigned) {
            newOp = new OutPt(0, point);
            outRec = OutRec.create(records, edge.isWindDeletaEmpty, newOp);
            newOp.Idx = outRec.Idx;
            newOp.Next = newOp;
            newOp.Prev = newOp;

            if (!outRec.IsOpen) {
                outRec.setHoleState(edge, records);
            }

            edge.OutIdx = outRec.Idx;
            //nb: do this after SetZ !
            return newOp;
        }

        outRec = records[edge.OutIdx];
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = outRec.Pts;

        if (isToFront && point.almostEqual(op.Pt)) {
            return op;
        }

        if (!isToFront && point.almostEqual(op.Prev.Pt)) {
            return op.Prev;
        }

        newOp = new OutPt(outRec.Idx, point, op, op.Prev);
        newOp.Prev.Next = newOp;
        op.Prev = newOp;

        if (isToFront) {
            outRec.Pts = newOp;
        }

        return newOp;
    }

    public static getOutRec(records: OutRec[], idx: number): OutRec {
        let result: OutRec = records[idx];

        while (result !== records[result.Idx]) {
            result = records[result.Idx];
        }

        return result;
    }

    public static create(output: OutRec[], isOpen: boolean = false, pointer: OutPt | null = null): OutRec {
        const result: OutRec = new OutRec(output.length, isOpen, pointer);

        output.push(result);

        return result;
    }
}
