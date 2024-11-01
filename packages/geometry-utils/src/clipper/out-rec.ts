import Point from '../point';
import OutPt from './out-pt';
import TEdge from './t-edge';
import { DIRECTION, NullPtr } from './types';

export default class OutRec {
    public Idx: number;
    public IsHole: boolean;
    public IsOpen: boolean;
    public FirstLeft: OutRec;
    public Pts: NullPtr<OutPt>;
    public BottomPt: OutPt;

    constructor(index: number = 0, isOpen: boolean = false, pointer: NullPtr<OutPt> = null) {
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
                (Point.slopesEqual(outPt.prev.point, outPt.point, outPt.next.point, useFullRange) &&
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

    public export(): NullPtr<Point[]> {
        const pointCount = this.pointCount;

        if (pointCount < 2) {
            return null;
        }

        const result: Point[] = new Array(pointCount);
        let outPt: OutPt = this.Pts.prev as OutPt;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i] = outPt.point;
            outPt = outPt.prev as OutPt;
        }

        return result;
    }

    public joinCommonEdges(outRec: OutRec, isReverseSolution: boolean): boolean {
        if (!outRec.containsPoly(this)) {
            return false;
        }
        //outRec1 is contained by outRec2 ...
        this.IsHole = !outRec.IsHole;
        this.FirstLeft = outRec;

        if ((this.IsHole !== isReverseSolution) === this.area > 0) {
            this.Pts.reverse();
        }

        return true;
    }

    public updateOutPtIdxs(): void {
        let outPt: OutPt = this.Pts;

        do {
            outPt.index = this.Idx;
            outPt = outPt.prev;
        } while (outPt !== this.Pts);
    }

    private containsPoly(outRec: OutRec): boolean {
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

    public setHoleState(inputEdge: TEdge, outs: OutRec[]): void {
        let isHole: boolean = false;
        let edge: NullPtr<TEdge> = inputEdge.PrevInAEL;

        while (edge !== null) {
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
                isHole = !isHole;

                if (this.FirstLeft === null) {
                    this.FirstLeft = outs[edge.index];
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
            op2 = outPt.next;

            while (op2 !== this.Pts) {
                if (outPt.point.almostEqual(op2.point) && op2.next != outPt && op2.prev != outPt) {
                    //split the polygon into two ...
                    op3 = outPt.prev;
                    op4 = op2.prev;
                    outPt.prev = op4;
                    op4.next = outPt;
                    op2.prev = op3;
                    op3.next = op2;
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
                op2 = op2.next;
            }
            outPt = outPt.next;
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

    public static parseFirstLeft(FirstLeft: OutRec): NullPtr<OutRec> {
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

        const bPt1: NullPtr<OutPt> = outRec1.BottomPt;
        const bPt2: NullPtr<OutPt> = outRec2.BottomPt;

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

    public static addOutPt(records: OutRec[], edge: TEdge, point: Point): OutPt {
        const isToFront: boolean = edge.Side === DIRECTION.LEFT;
        let outRec: OutRec = null;
        let newOp: OutPt = null;

        if (!edge.isAssigned) {
            newOp = new OutPt(0, point);
            outRec = OutRec.create(records, edge.isWindDeletaEmpty, newOp);
            newOp.index = outRec.Idx;
            newOp.next = newOp;
            newOp.prev = newOp;

            if (!outRec.IsOpen) {
                outRec.setHoleState(edge, records);
            }

            edge.index = outRec.Idx;
            //nb: do this after SetZ !
            return newOp;
        }

        outRec = records[edge.index];
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = outRec.Pts;

        if (isToFront && point.almostEqual(op.point)) {
            return op;
        }

        if (!isToFront && point.almostEqual(op.prev.point)) {
            return op.prev;
        }

        newOp = new OutPt(outRec.Idx, point, op, op.prev);
        newOp.prev.next = newOp;
        op.prev = newOp;

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

    public static getHoleStateRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        switch (true) {
            case OutRec.param1RightOfParam2(outRec1, outRec2):
                return outRec2;
            case OutRec.param1RightOfParam2(outRec2, outRec1):
                return outRec1;
            default:
                return OutRec.getLowermostRec(outRec1, outRec2);
        }
    }

    public static addLocalMaxPoly(records: OutRec[], edge1: TEdge, edge2: TEdge, point: Point, activeEdge: TEdge): void {
        OutRec.addOutPt(records, edge1, point);

        if (edge2.isWindDeletaEmpty) {
            OutRec.addOutPt(records, edge2, point);
        }

        if (edge1.index === edge2.index) {
            edge1.unassign();
            edge2.unassign();
            return;
        }

        const firstEdge: TEdge = edge1.index < edge2.index ? edge1 : edge2;
        const secondEdge: TEdge = edge1.index < edge2.index ? edge2 : edge1;

        //get the start and ends of both output polygons ...
        const outRec1: OutRec = records[firstEdge.index];
        const outRec2: OutRec = records[secondEdge.index];
        const holeStateRec: OutRec = OutRec.getHoleStateRec(outRec1, outRec2);
        const p1_lft: OutPt = outRec1.Pts;
        const p1_rt: OutPt = p1_lft.prev;
        const p2_lft: OutPt = outRec2.Pts;
        const p2_rt: OutPt = p2_lft.prev;
        let side: DIRECTION;
        //join e2 poly onto e1 poly and delete pointers to e2 ...
        if (firstEdge.Side === DIRECTION.LEFT) {
            if (secondEdge.Side === DIRECTION.LEFT) {
                //z y x a b c
                p2_lft.reverse();
                p2_lft.next = p1_lft;
                p1_lft.prev = p2_lft;
                p1_rt.next = p2_rt;
                p2_rt.prev = p1_rt;
                outRec1.Pts = p2_rt;
            } else {
                //x y z a b c
                p2_rt.next = p1_lft;
                p1_lft.prev = p2_rt;
                p2_lft.prev = p1_rt;
                p1_rt.next = p2_lft;
                outRec1.Pts = p2_lft;
            }
            side = DIRECTION.LEFT;
        } else {
            if (secondEdge.Side === DIRECTION.RIGHT) {
                //a b c z y x
                p2_lft.reverse();
                p1_rt.next = p2_rt;
                p2_rt.prev = p1_rt;
                p2_lft.next = p1_lft;
                p1_lft.prev = p2_lft;
            } else {
                //a b c x y z
                p1_rt.next = p2_lft;
                p2_lft.prev = p1_rt;
                p1_lft.prev = p2_rt;
                p2_rt.next = p1_lft;
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
        const OKIdx: number = firstEdge.index;
        const ObsoleteIdx: number = secondEdge.index;
        firstEdge.unassign();
        //nb: safe because we only get here via AddLocalMaxPoly
        secondEdge.unassign();

        let e: TEdge = activeEdge;

        while (e !== null) {
            if (e.index === ObsoleteIdx) {
                e.index = OKIdx;
                e.Side = side;
                break;
            }
            e = e.NextInAEL;
        }

        outRec2.Idx = outRec1.Idx;
    }

    public static create(output: OutRec[], isOpen: boolean = false, pointer: NullPtr<OutPt> = null): OutRec {
        const result: OutRec = new OutRec(output.length, isOpen, pointer);

        output.push(result);

        return result;
    }
}
