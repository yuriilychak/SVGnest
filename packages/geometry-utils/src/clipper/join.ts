import Point from '../point';
import OutPt from './out-pt';
import OutRec from './out-rec';

export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: Point;

    constructor(outPt1: OutPt | null = null, outPt2: OutPt | null = null, offPoint: Point | null = null) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = offPoint === null ? Point.zero() : Point.from(offPoint);
    }

    public joinPoints(outRec1: OutRec, outRec2: OutRec, isUseFullRange: boolean): boolean {
        let op1: OutPt = this.OutPt1;
        let op2: OutPt = this.OutPt2;
        let op1b: OutPt = new OutPt();
        let op2b: OutPt = new OutPt();
        //There are 3 kinds of joins for output polygons ...
        //1. Horizontal joins where Join.OutPt1 & Join.OutPt2 are a vertices anywhere
        //along (horizontal) collinear edges (& Join.OffPt is on the same horizontal).
        //2. Non-horizontal joins where Join.OutPt1 & Join.OutPt2 are at the same
        //location at the Bottom of the overlapping segment (& Join.OffPt is above).
        //3. StrictlySimple joins where edges touch but are not collinear and where
        //Join.OutPt1, Join.OutPt2 & Join.OffPt all share the same point.
        const isHorizontal: boolean = this.OutPt1.Pt.y === this.OffPt.y;

        if (isHorizontal && this.OffPt.almostEqual(this.OutPt1.Pt) && this.OffPt.almostEqual(this.OutPt2.Pt)) {
            //Strictly Simple join ...
            op1b = this.OutPt1.Next;

            while (op1b !== op1 && op1b.Pt.almostEqual(this.OffPt)) {
                op1b = op1b.Next;
            }

            const reverse1: boolean = op1b.Pt.y > this.OffPt.y;
            op2b = this.OutPt2.Next;

            while (op2b !== op2 && op2b.Pt.almostEqual(this.OffPt)) {
                op2b = op2b.Next;
            }

            const reverse2: boolean = op2b.Pt.y > this.OffPt.y;

            if (reverse1 === reverse2) {
                return false;
            }

            if (reverse1) {
                op1b = op1.duplicate(false);
                op2b = op2.duplicate(true);
                op1.Prev = op2;
                op2.Next = op1;
                op1b.Next = op2b;
                op2b.Prev = op1b;
                this.OutPt1 = op1;
                this.OutPt2 = op1b;
            } else {
                op1b = op1.duplicate(true);
                op2b = op2.duplicate(false);
                op1.Next = op2;
                op2.Prev = op1;
                op1b.Prev = op2b;
                op2b.Next = op1b;
                this.OutPt1 = op1;
                this.OutPt2 = op1b;
            }

            return true;
        } else if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            op1b = op1;
            while (op1.Prev.Pt.y === op1.Pt.y && op1.Prev !== op1b && op1.Prev !== op2) op1 = op1.Prev;
            while (op1b.Next.Pt.y === op1b.Pt.y && op1b.Next !== op1 && op1b.Next !== op2) op1b = op1b.Next;
            if (op1b.Next === op1 || op1b.Next === op2) return false;
            //a flat 'polygon'
            op2b = op2;
            while (op2.Prev.Pt.y === op2.Pt.y && op2.Prev !== op2b && op2.Prev !== op1b) op2 = op2.Prev;
            while (op2b.Next.Pt.y === op2b.Pt.y && op2b.Next !== op2 && op2b.Next !== op1) op2b = op2b.Next;
            if (op2b.Next === op2 || op2b.Next === op1) return false;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value: Point = Join.getOverlap(op1.Pt.x, op1b.Pt.x, op2.Pt.x, op2b.Pt.x);
            const isOverlapped = value.x < value.y;

            if (!isOverlapped) {
                return false;
            }

            //DiscardLeftSide: when overlapping edges are joined, a spike will created
            //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
            //on the discard Side as either may still be needed for other joins ...
            const Pt: Point = Point.zero();
            let DiscardLeftSide: boolean = false;
            if (op1.Pt.x >= value.x && op1.Pt.x <= value.y) {
                //Pt = op1.Pt;
                Pt.update(op1.Pt);
                DiscardLeftSide = op1.Pt.x > op1b.Pt.x;
            } else if (op2.Pt.x >= value.x && op2.Pt.x <= value.y) {
                //Pt = op2.Pt;
                Pt.update(op2.Pt);
                DiscardLeftSide = op2.Pt.x > op2b.Pt.x;
            } else if (op1b.Pt.x >= value.x && op1b.Pt.x <= value.y) {
                //Pt = op1b.Pt;
                Pt.update(op1b.Pt);
                DiscardLeftSide = op1b.Pt.x > op1.Pt.x;
            } else {
                //Pt = op2b.Pt;
                Pt.update(op2b.Pt);
                DiscardLeftSide = op2b.Pt.x > op2.Pt.x;
            }
            this.OutPt1 = op1;
            this.OutPt2 = op2;
            return OutPt.joinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
        } else {
            //nb: For non-horizontal joins ...
            //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
            //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
            //make sure the polygons are correctly oriented ...
            op1b = op1.Next;

            while (op1b.Pt.almostEqual(op1.Pt) && op1b !== op1) {
                op1b = op1b.Next;
            }

            const reverse1: boolean = op1b.Pt.y > op1.Pt.y || !Point.slopesEqual(op1.Pt, op1b.Pt, this.OffPt, isUseFullRange);

            if (reverse1) {
                op1b = op1.Prev;

                while (op1b.Pt.almostEqual(op1.Pt) && op1b !== op1) {
                    op1b = op1b.Prev;
                }

                if (op1b.Pt.y > op1.Pt.y || !Point.slopesEqual(op1.Pt, op1b.Pt, this.OffPt, isUseFullRange)) {
                    return false;
                }
            }

            op2b = op2.Next;

            while (op2b.Pt.almostEqual(op2.Pt) && op2b !== op2) {
                op2b = op2b.Next;
            }

            const reverse2: boolean = op2b.Pt.y > op2.Pt.y || !Point.slopesEqual(op2.Pt, op2b.Pt, this.OffPt, isUseFullRange);

            if (reverse2) {
                op2b = op2.Prev;

                while (op2b.Pt.almostEqual(op2.Pt) && op2b !== op2) {
                    op2b = op2b.Prev;
                }

                if (op2b.Pt.y > op2.Pt.y || !Point.slopesEqual(op2.Pt, op2b.Pt, this.OffPt, isUseFullRange)) {
                    return false;
                }
            }

            if (op1b === op1 || op2b === op2 || op1b === op2b || (outRec1 === outRec2 && reverse1 === reverse2)) {
                return false;
            }

            if (reverse1) {
                op1b = op1.duplicate(false);
                op2b = op2.duplicate(true);
                op1.Prev = op2;
                op2.Next = op1;
                op1b.Next = op2b;
                op2b.Prev = op1b;
                this.OutPt1 = op1;
                this.OutPt2 = op1b;
            } else {
                op1b = op1.duplicate(true);
                op2b = op2.duplicate(false);
                op1.Next = op2;
                op2.Prev = op1;
                op1b.Prev = op2b;
                op2b.Next = op1b;
                this.OutPt1 = op1;
                this.OutPt2 = op1b;
            }

            return true;
        }
    }

    public static getOverlap(a1: number, a2: number, b1: number, b2: number): Point {
        if (a1 < a2) {
            return b1 < b2
                ? Point.create(Math.max(a1, b1), Math.min(a2, b2))
                : Point.create(Math.max(a1, b2), Math.min(a2, b1));
        }

        return b1 < b2 ? Point.create(Math.max(a2, b1), Math.min(a1, b2)) : Point.create(Math.max(a2, b2), Math.min(a1, b1));
    }
}
