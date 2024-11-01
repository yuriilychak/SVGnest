import Point from '../point';
import { HORIZONTAL } from './constants';
import { DIRECTION, NullPtr } from './types';

export default class OutPt {
    public index: number;

    public point: Point;

    public next: NullPtr<OutPt>;

    public prev: NullPtr<OutPt>;

    constructor(index: number = 0, point: NullPtr<Point> = null, next: NullPtr<OutPt> = null, prev: NullPtr<OutPt> = null) {
        this.index = index;
        this.point = point === null ? Point.zero() : Point.from(point);
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

    public pointIn(pt: Point): number {
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

    public static firstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
        let p: OutPt = btmPt1.prev;

        while (p.point.almostEqual(btmPt1.point) && p !== btmPt1) {
            p = p.prev;
        }

        const dx1p: number = OutPt.getDx(btmPt1, p);

        p = btmPt1.next;

        while (p.point.almostEqual(btmPt1.point) && p !== btmPt1) {
            p = p.next;
        }

        const dx1n: number = OutPt.getDx(btmPt1, p);

        p = btmPt2.prev;

        while (p.point.almostEqual(btmPt2.point) && p !== btmPt2) {
            p = p.prev;
        }

        const dx2p: number = OutPt.getDx(btmPt2, p);

        p = btmPt2.next;

        while (p.point.almostEqual(btmPt2.point) && p !== btmPt2) {
            p = p.next;
        }

        const dx2n: number = OutPt.getDx(btmPt2, p);
        const maxDx: number = Math.max(dx2p, dx2n);

        return dx1p >= maxDx || dx1n >= maxDx;
    }

    public static joinHorz(op1: OutPt, op1b: OutPt, op2: OutPt, op2b: OutPt, Pt: Point, isDiscardLeft: boolean) {
        const direction1: DIRECTION = op1.point.x > op1b.point.x ? DIRECTION.LEFT : DIRECTION.RIGHT;
        const direction2: DIRECTION = op2.point.x > op2b.point.x ? DIRECTION.LEFT : DIRECTION.RIGHT;

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        if (direction1 === DIRECTION.RIGHT) {
            while (op1.next.point.x <= Pt.x && op1.next.point.x >= op1.point.x && op1.next.point.y === Pt.y) {
                op1 = op1.next;
            }

            if (isDiscardLeft && op1.point.x !== Pt.x) {
                op1 = op1.next;
            }

            op1b = op1.duplicate(!isDiscardLeft);

            if (!op1b.point.almostEqual(Pt)) {
                op1 = op1b;
                //op1.Pt = Pt;
                op1.point.update(Pt);
                op1b = op1.duplicate(!isDiscardLeft);
            }
        } else {
            while (op1.next.point.x >= Pt.x && op1.next.point.x <= op1.point.x && op1.next.point.y === Pt.y) {
                op1 = op1.next;
            }

            if (!isDiscardLeft && op1.point.x !== Pt.x) {
                op1 = op1.next;
            }

            op1b = op1.duplicate(isDiscardLeft);

            if (!op1b.point.almostEqual(Pt)) {
                op1 = op1b;
                //op1.Pt = Pt;
                op1.point.update(Pt);
                op1b = op1.duplicate(isDiscardLeft);
            }
        }
        if (direction2 === DIRECTION.RIGHT) {
            while (op2.next.point.x <= Pt.x && op2.next.point.x >= op2.point.x && op2.next.point.y === Pt.y) {
                op2 = op2.next;
            }

            if (isDiscardLeft && op2.point.x !== Pt.x) {
                op2 = op2.next;
            }

            op2b = op2.duplicate(!isDiscardLeft);

            if (!op2b.point.almostEqual(Pt)) {
                op2 = op2b;
                //op2.Pt = Pt;
                op2.point.update(Pt);
                op2b = op2.duplicate(!isDiscardLeft);
            }
        } else {
            while (op2.next.point.x >= Pt.x && op2.next.point.x <= op2.point.x && op2.next.point.y === Pt.y) {
                op2 = op2.next;
            }

            if (!isDiscardLeft && op2.point.x !== Pt.x) {
                op2 = op2.next;
            }

            op2b = op2.duplicate(isDiscardLeft);
            if (!op2b.point.almostEqual(Pt)) {
                op2 = op2b;
                //op2.Pt = Pt;
                op2.point.update(Pt);
                op2b = op2.duplicate(isDiscardLeft);
            }
        }

        if ((direction1 === DIRECTION.RIGHT) === isDiscardLeft) {
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

        return true;
    }

    public static getDx(outPt1: OutPt, outPt2: OutPt): number {
        const offsetY: number = outPt2.point.y - outPt1.point.y;
        const offsetX: number = outPt2.point.x - outPt1.point.x;
        const result = offsetY === 0 ? HORIZONTAL : offsetX / offsetY;

        return Math.abs(result);
    }
}
