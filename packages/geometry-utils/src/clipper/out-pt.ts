import { PointI32 } from '../geometry/point';
import { HORIZONTAL } from './constants';
import { DIRECTION, NullPtr } from './types';

export default class OutPt {
    public index: number;

    public point: PointI32;

    public next: NullPtr<OutPt>;

    public prev: NullPtr<OutPt>;

    constructor(index: number = 0, point: NullPtr<PointI32> = null, next: NullPtr<OutPt> = null, prev: NullPtr<OutPt> = null) {
        this.index = index;
        this.point = PointI32.from(point);
        this.next = next;
        this.prev = prev;
    }

    public exclude(): OutPt {
        const result: OutPt = this.prev;
        result.next = this.next;
        this.next.prev = result;
        result.index = 0;

        return result;
    }

    public dispose(): void {
        let outPt: OutPt = this;

        outPt.prev.next = null;

        while (outPt !== null) {
            outPt = outPt.next;
        }
    }

    public duplicate(isInsertAfter: boolean): OutPt {
        const result: OutPt = new OutPt(this.index, this.point);

        if (isInsertAfter) {
            result.next = this.next;
            result.prev = this;
            this.next.prev = result;
            this.next = result;
        } else {
            result.prev = this.prev;
            result.next = this;
            this.prev.next = result;
            this.prev = result;
        }

        return result;
    }

    public get pointCount(): number {
        let result: number = 0;
        let outPt: OutPt = this;

        do {
            ++result;
            outPt = outPt.next;
        } while (outPt !== this);

        return result;
    }

    public reverse(): void {
        let outPt: OutPt = this;
        let pp1: OutPt = outPt;
        let pp2: NullPtr<OutPt> = null;

        do {
            pp2 = pp1.next;
            pp1.next = pp1.prev;
            pp1.prev = pp2;
            pp1 = pp2;
        } while (pp1 !== outPt);
    }

    public getUniquePt(isNext: boolean): OutPt {
        let result = this.getNeighboar(isNext);

        while (result.point.almostEqual(this.point) && result !== this) {
            result = result.getNeighboar(isNext);
        }

        return result;
    }

    public pointIn(pt: PointI32): number {
        //returns 0 if false, +1 if true, -1 if pt ON polygon boundary
        //http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.88.5498&rep=rep1&type=pdf
        let outPt: OutPt = this;
        let startOutPt: OutPt = outPt;
        let result: number = 0;
        let poly0x: number = 0;
        let poly0y: number = 0;
        let poly1x: number = 0;
        let poly1y: number = 0;
        let d: number = 0;

        while (true) {
            poly0x = outPt.point.x;
            poly0y = outPt.point.y;
            poly1x = outPt.next.point.x;
            poly1y = outPt.next.point.y;

            if (poly1y === pt.y) {
                if (poly1x === pt.x || (poly0y === pt.y && poly1x > pt.x === poly0x < pt.x)) {
                    return -1;
                }
            }

            if (poly0y < pt.y !== poly1y < pt.y) {
                if (poly0x >= pt.x) {
                    if (poly1x > pt.x) {
                        result = 1 - result;
                    } else {
                        d = (poly0x - pt.x) * (poly1y - pt.y) - (poly1x - pt.x) * (poly0y - pt.y);

                        if (d == 0) {
                            return -1;
                        }

                        if (d > 0 === poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                } else {
                    if (poly1x > pt.x) {
                        d = (poly0x - pt.x) * (poly1y - pt.y) - (poly1x - pt.x) * (poly0y - pt.y);

                        if (d === 0) {
                            return -1;
                        }

                        if (d > 0 === poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                }
            }

            outPt = outPt.next;

            if (startOutPt == outPt) {
                break;
            }
        }

        return result;
    }

    private getNeighboar(isNext: boolean): NullPtr<OutPt> {
        return isNext ? this.next : this.prev;
    }

    private getDistance(isNext: boolean): number {
        let p: OutPt = this.getNeighboar(isNext);

        if(p === null) {
            return Number.NaN;
        }

        while (p.point.almostEqual(this.point) && p !== this) {
            p = p.getNeighboar(isNext);

            if(p === null) {
                return Number.NaN;
            }
        }

        const offsetY: number = p.point.y - this.point.y;
        const offsetX: number = p.point.x - this.point.x;
        const result = offsetY === 0 ? HORIZONTAL : offsetX / offsetY;

        return Math.abs(result);
    }

    public getBottomPt(): OutPt {
        let outPt1: OutPt = this;
        let outPt2: OutPt = this.next;
        let dups: NullPtr<OutPt> = null;

        while (outPt2 !== outPt1) {
            if (outPt2.point.y > outPt1.point.y) {
                outPt1 = outPt2;
                dups = null;
            } else if (outPt2.point.y == outPt1.point.y && outPt2.point.x <= outPt1.point.x) {
                if (outPt2.point.x < outPt1.point.x) {
                    dups = null;
                    outPt1 = outPt2;
                } else if (outPt2.next !== outPt1 && outPt2.prev !== outPt1) {
                    dups = outPt2;
                }
            }
            outPt2 = outPt2.next;
        }
        if (dups !== null) {
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dups !== outPt2) {
                if (!OutPt.firstIsBottomPt(outPt2, dups)) {
                    outPt1 = dups;
                }

                dups = dups.next;
                
                while (!dups.point.almostEqual(outPt1.point)) {
                    dups = dups.next;
                }
            }
        }
        return outPt1;
    }

    public getDirection(outPt: OutPt): DIRECTION {
        return this.point.x > outPt.point.x ? DIRECTION.LEFT : DIRECTION.RIGHT
    }


    public static firstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
        const dx1p: number = btmPt1.getDistance(false);
        const dx1n: number = btmPt1.getDistance(true);
        const dx2p: number = btmPt2.getDistance(false);
        const dx2n: number = btmPt2.getDistance(true);

        const maxDx: number = Math.max(dx2p, dx2n);

        return dx1p >= maxDx || dx1n >= maxDx;
    }

    public getDiscarded(isRight: boolean, pt: PointI32): boolean {
        const next =  this.next;

        if (next == null) {
            return false;
        }

        if (isRight) {
            return next.point.x <= pt.x && next.point.x >= this.point.x && next.point.y === pt.y;
        } else {
            return next.point.x >= pt.x && next.point.x <= this.point.x && next.point.y === pt.y;
        }
    } 

    public joinHorz(outPt: OutPt, point: PointI32, isDiscardLeft: boolean): { op: OutPt, opB: OutPt, isRightOrder: boolean } {
        let op: OutPt = this;
        let opB: OutPt = outPt;

        const direction: DIRECTION = op.getDirection(opB);
        const isRight = direction === DIRECTION.RIGHT;
        const isRightOrder = isDiscardLeft !== isRight;

        while (op.getDiscarded(isRight, point)) {
            op = op.next;
        }

        if (!isRightOrder && op.point.x !== point.x) {
            op = op.next;
        }

        opB = op.duplicate(isRightOrder);

        if (!opB.point.almostEqual(point)) {
            op = opB;
            //op1.Pt = Pt;
            op.point.update(point);
            opB = op.duplicate(isRightOrder);
        }

        return { op, opB, isRightOrder };
    }

    public static joinHorz(op1: OutPt, op1b: OutPt, op2: OutPt, op2b: OutPt, Pt: PointI32, isDiscardLeft: boolean) {
        const direction1: DIRECTION = op1.getDirection(op1b);
        const direction2: DIRECTION = op2.getDirection(op2b);

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        const join1 = op1.joinHorz(op1b, Pt, isDiscardLeft);
        const join2 = op2.joinHorz(op2b, Pt, isDiscardLeft);

        const op1_inner = join1.op;
        const op1b_inner = join1.opB;
        const op2_inner = join2.op;
        const op2b_inner = join2.opB;

        if (join1.isRightOrder) {
            op1_inner.next = op2_inner;
            op2_inner.prev = op1_inner;
            op1b_inner.prev = op2b_inner;
            op2b_inner.next = op1b_inner;
        } else {
            op1_inner.prev = op2_inner;
            op2_inner.next = op1_inner;
            op1b_inner.next = op2b_inner;
            op2b_inner.prev = op1b_inner;
        }

        return true;
    }
}
