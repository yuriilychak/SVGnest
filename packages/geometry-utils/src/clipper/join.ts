import { PointI32 } from '../geometry';
import OutPt from './out-pt';
import { NullPtr } from './types';
export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: PointI32;

    constructor(outPt1: NullPtr<OutPt> = null, outPt2: NullPtr<OutPt> = null, offPoint: NullPtr<PointI32> = null) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = PointI32.from(offPoint);
    }

    private applyJoin(op1: OutPt, op2: OutPt, reverse: boolean) {
        const op1b = op1.duplicate(!reverse);
        const op2b = op2.duplicate(reverse);

        if (reverse) {
            op1.prev = op2;
            op2.next = op1;
            op1b.next = op2b;
            op2b.prev = op1b;
        } else {
            op1.next = op2;
            op2.prev = op1;
            op1b.prev = op2b;
            op2b.next = op1b;
            
        }

        this.OutPt1 = op1;
        this.OutPt2 = op1b;
    }

    public joinPoints(isRecordsSame: boolean, isUseFullRange: boolean): boolean {
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
        const isHorizontal: boolean = this.OutPt1.point.y === this.OffPt.y;

        if (isHorizontal && this.OffPt.almostEqual(this.OutPt1.point) && this.OffPt.almostEqual(this.OutPt2.point)) {
            //Strictly Simple join ...
            op1b = this.OutPt1.next;

            while (op1b !== op1 && op1b.point.almostEqual(this.OffPt)) {
                op1b = op1b.next;
            }

            const reverse1: boolean = op1b.point.y > this.OffPt.y;
            op2b = this.OutPt2.next;

            while (op2b !== op2 && op2b.point.almostEqual(this.OffPt)) {
                op2b = op2b.next;
            }

            const reverse2: boolean = op2b.point.y > this.OffPt.y;

            if (reverse1 === reverse2) {
                return false;
            }

            this.applyJoin(op1, op2, reverse1);

            return true;
        } else if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            op1b = op1;
            while (op1.prev.point.y === op1.point.y && op1.prev !== op1b && op1.prev !== op2) op1 = op1.prev;
            while (op1b.next.point.y === op1b.point.y && op1b.next !== op1 && op1b.next !== op2) op1b = op1b.next;
            if (op1b.next === op1 || op1b.next === op2) return false;
            //a flat 'polygon'
            op2b = op2;
            while (op2.prev.point.y === op2.point.y && op2.prev !== op2b && op2.prev !== op1b) op2 = op2.prev;
            while (op2b.next.point.y === op2b.point.y && op2b.next !== op2 && op2b.next !== op1) op2b = op2b.next;
            if (op2b.next === op2 || op2b.next === op1) return false;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value: PointI32 = Join.getOverlap(op1.point.x, op1b.point.x, op2.point.x, op2b.point.x);
            const isOverlapped = value.x < value.y;

            if (!isOverlapped) {
                return false;
            }

            //DiscardLeftSide: when overlapping edges are joined, a spike will created
            //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
            //on the discard Side as either may still be needed for other joins ...
            const Pt: PointI32 = PointI32.create();
            let DiscardLeftSide: boolean = false;
            if (op1.point.x >= value.x && op1.point.x <= value.y) {
                //Pt = op1.Pt;
                Pt.update(op1.point);
                DiscardLeftSide = op1.point.x > op1b.point.x;
            } else if (op2.point.x >= value.x && op2.point.x <= value.y) {
                //Pt = op2.Pt;
                Pt.update(op2.point);
                DiscardLeftSide = op2.point.x > op2b.point.x;
            } else if (op1b.point.x >= value.x && op1b.point.x <= value.y) {
                //Pt = op1b.Pt;
                Pt.update(op1b.point);
                DiscardLeftSide = op1b.point.x > op1.point.x;
            } else {
                //Pt = op2b.Pt;
                Pt.update(op2b.point);
                DiscardLeftSide = op2b.point.x > op2.point.x;
            }
            this.OutPt1 = op1;
            this.OutPt2 = op2;
            return OutPt.joinHorz(op1, op1b, op2, op2b, Pt, DiscardLeftSide);
        } else {
            //nb: For non-horizontal joins ...
            //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
            //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
            //make sure the polygons are correctly oriented ...
            op1b = op1.getUniquePt(true);

            const reverse1: boolean =
                op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, this.OffPt, isUseFullRange);

            if (reverse1) {
                op1b = op1.getUniquePt(false);

                if (op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, this.OffPt, isUseFullRange)) {
                    return false;
                }
            }

            op2b = op2.getUniquePt(true);

            const reverse2: boolean =
                op2b.point.y > op2.point.y || !PointI32.slopesEqual(op2.point, op2b.point, this.OffPt, isUseFullRange);

            if (reverse2) {
                op2b = op2.getUniquePt(false);

                if (op2b.point.y > op2.point.y || !PointI32.slopesEqual(op2.point, op2b.point, this.OffPt, isUseFullRange)) {
                    return false;
                }
            }

            if (op1b === op1 || op2b === op2 || op1b === op2b || (isRecordsSame && reverse1 === reverse2)) {
                return false;
            }

            this.applyJoin(op1, op2, reverse1);

            return true;
        }
    }

    public static getOverlap(a1: number, a2: number, b1: number, b2: number): PointI32 {
        if (a1 < a2) {
            return b1 < b2
                ? PointI32.create(Math.max(a1, b1), Math.min(a2, b2))
                : PointI32.create(Math.max(a1, b2), Math.min(a2, b1));
        }

        return b1 < b2 ? PointI32.create(Math.max(a2, b1), Math.min(a1, b2)) : PointI32.create(Math.max(a2, b2), Math.min(a1, b1));
    }
}
