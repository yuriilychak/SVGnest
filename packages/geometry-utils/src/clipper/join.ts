import { PointI32 } from '../geometry';
import OutPt from './out-pt';
import { NullPtr } from './types';
import { Point } from 'src/types';
export default class Join {
    public OutPt1: OutPt;
    public OutPt2: OutPt;
    public OffPt: Point<Int32Array>;

    constructor(outPt1: NullPtr<OutPt>, outPt2: NullPtr<OutPt>, offPoint: NullPtr<Point<Int32Array>>) {
        this.OutPt1 = outPt1;
        this.OutPt2 = outPt2;
        this.OffPt = PointI32.from(offPoint);
    }

    public joinPoints(isRecordsSame: boolean, isUseFullRange: boolean): boolean {
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
            const op1b = this.OutPt1.strictlySimpleJoin(this.OffPt);
            const op2b = this.OutPt2.strictlySimpleJoin(this.OffPt);

            const reverse1: boolean = op1b.point.y > this.OffPt.y;
            const reverse2: boolean = op2b.point.y > this.OffPt.y;

            if (reverse1 === reverse2) {
                return false;
            }

            this.OutPt2 = this.OutPt1.applyJoin(this.OutPt2, reverse1);

            return true;
        } else if (isHorizontal) {
            //treat horizontal joins differently to non-horizontal joins since with
            //them we're not yet sure where the overlapping is. OutPt1.Pt & OutPt2.Pt
            //may be anywhere along the horizontal edge.
            const outPt1Res = this.OutPt1.flatHorizontal(this.OutPt2, this.OutPt2);

            if (outPt1Res.length === 0) {
                return false;
            }

            const [op1, op1b] = outPt1Res;
            //a flat 'polygon'
            const outPt2Res = this.OutPt2.flatHorizontal(op1, op1b);

            if (outPt2Res.length === 0) {
                return false;
            }

            const [op2, op2b] = outPt2Res;
            //a flat 'polygon'
            //Op1 -. Op1b & Op2 -. Op2b are the extremites of the horizontal edges

            const value = PointI32.getOverlap(op1.point.x, op1b.point.x, op2.point.x, op2b.point.x);
            const isOverlapped = value.x < value.y;

            if (!isOverlapped) {
                return false;
            }

            //DiscardLeftSide: when overlapping edges are joined, a spike will created
            //which needs to be cleaned up. However, we don't want Op1 or Op2 caught up
            //on the discard Side as either may still be needed for other joins ...
            const point = PointI32.create();
            let DiscardLeftSide: boolean = false;
            if (op1.point.x >= value.x && op1.point.x <= value.y) {
                //Pt = op1.Pt;
                point.update(op1.point);
                DiscardLeftSide = op1.point.x > op1b.point.x;
            } else if (op2.point.x >= value.x && op2.point.x <= value.y) {
                //Pt = op2.Pt;
                point.update(op2.point);
                DiscardLeftSide = op2.point.x > op2b.point.x;
            } else if (op1b.point.x >= value.x && op1b.point.x <= value.y) {
                //Pt = op1b.Pt;
                point.update(op1b.point);
                DiscardLeftSide = op1b.point.x > op1.point.x;
            } else {
                //Pt = op2b.Pt;
                point.update(op2b.point);
                DiscardLeftSide = op2b.point.x > op2.point.x;
            }
            this.OutPt1 = op1;
            this.OutPt2 = op2;

            return OutPt.joinHorz(op1, op1b, op2, op2b, point, DiscardLeftSide);
        } else {
            let op1 = this.OutPt1;
            let op2 = this.OutPt2;
            let op1b: OutPt = op1.getUniquePt(true);
            let op2b: OutPt = op2.getUniquePt(true);
            //nb: For non-horizontal joins ...
            //    1. Jr.OutPt1.Pt.Y === Jr.OutPt2.Pt.Y
            //    2. Jr.OutPt1.Pt > Jr.OffPt.Y
            //make sure the polygons are correctly oriented ...

            const reverse1: boolean =
                op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, this.OffPt, isUseFullRange);

            if (reverse1) {
                op1b = op1.getUniquePt(false);

                if (op1b.point.y > op1.point.y || !PointI32.slopesEqual(op1.point, op1b.point, this.OffPt, isUseFullRange)) {
                    return false;
                }
            }

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

            this.OutPt2 = this.OutPt1.applyJoin(this.OutPt2, reverse1);

            return true;
        }
    }

}
