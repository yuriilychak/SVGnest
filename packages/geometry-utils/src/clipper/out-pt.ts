import Point from '../point';
import { GetDx } from './helpers';
import { Direction } from './types';

export default class OutPt {
    public Idx: number;

    public Pt: Point;

    public Next: OutPt | null;

    public Prev: OutPt | null;

    constructor(index: number = 0, point: Point | null = null, next: OutPt | null = null, prev: OutPt | null = null) {
        this.Idx = index;
        this.Pt = point === null ? Point.zero() : Point.from(point);
        this.Next = next;
        this.Prev = prev;
    }

    public exclude(): OutPt {
        const result: OutPt = this.Prev;
        result.Next = this.Next;
        this.Next.Prev = result;
        result.Idx = 0;

        return result;
    }

    public dispose(): void {
        let outPt: OutPt = this;

        outPt.Prev.Next = null;

        while (outPt !== null) {
            outPt = outPt.Next;
        }
    }

    public duplicate(isInsertAfter: boolean): OutPt {
        const result: OutPt = new OutPt(this.Idx, this.Pt);

        if (isInsertAfter) {
            result.Next = this.Next;
            result.Prev = this;
            this.Next.Prev = result;
            this.Next = result;
        } else {
            result.Prev = this.Prev;
            result.Next = this;
            this.Prev.Next = result;
            this.Prev = result;
        }

        return result;
    }

    public get pointCount(): number {
        let result: number = 0;
        let outPt: OutPt = this;

        do {
            ++result;
            outPt = outPt.Next;
        } while (outPt != this);

        return result;
    }

    public reverse(): void {
        let outPt: OutPt = this;
        let pp1: OutPt = outPt;
        let pp2: OutPt | null = null;

        do {
            pp2 = pp1.Next;
            pp1.Next = pp1.Prev;
            pp1.Prev = pp2;
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
            poly0x = outPt.Pt.x;
            poly0y = outPt.Pt.y;
            poly1x = outPt.Next.Pt.x;
            poly1y = outPt.Next.Pt.y;

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

            outPt = outPt.Next;

            if (startOutPt == outPt) {
                break;
            }
        }

        return result;
    }

    public getBottomPt(): OutPt {
        let outPt1: OutPt = this;
        let outPt2: OutPt = this.Next;
        let dups: OutPt | null = null;

        while (outPt2 != outPt1) {
            if (outPt2.Pt.y > outPt1.Pt.y) {
                outPt1 = outPt2;
                dups = null;
            } else if (outPt2.Pt.y == outPt1.Pt.y && outPt2.Pt.x <= outPt1.Pt.x) {
                if (outPt2.Pt.x < outPt1.Pt.x) {
                    dups = null;
                    outPt1 = outPt2;
                } else {
                    if (outPt2.Next != outPt1 && outPt2.Prev != outPt1) {
                        dups = outPt2;
                    }
                }
            }
            outPt2 = outPt2.Next;
        }
        if (dups !== null) {
            //there appears to be at least 2 vertices at bottomPt so ...
            while (dups != outPt2) {
                if (!OutPt.firstIsBottomPt(outPt2, dups)) {
                    outPt1 = dups;
                }
                dups = dups.Next;
                while (!dups.Pt.almostEqual(outPt1.Pt)) {
                    dups = dups.Next;
                }
            }
        }
        return outPt1;
    }

    public static firstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
        let p: OutPt = btmPt1.Prev;

        while (p.Pt.almostEqual(btmPt1.Pt) && p != btmPt1) {
            p = p.Prev;
        }

        let dx1p: number = Math.abs(GetDx(btmPt1.Pt, p.Pt));
        p = btmPt1.Next;

        while (p.Pt.almostEqual(btmPt1.Pt) && p != btmPt1) {
            p = p.Next;
        }

        let dx1n: number = Math.abs(GetDx(btmPt1.Pt, p.Pt));

        p = btmPt2.Prev;

        while (p.Pt.almostEqual(btmPt2.Pt) && p != btmPt2) {
            p = p.Prev;
        }

        let dx2p: number = Math.abs(GetDx(btmPt2.Pt, p.Pt));

        p = btmPt2.Next;

        while (p.Pt.almostEqual(btmPt2.Pt) && p != btmPt2) {
            p = p.Next;
        }

        let dx2n: number = Math.abs(GetDx(btmPt2.Pt, p.Pt));

        return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
    }

    public static joinHorz(op1: OutPt, op1b: OutPt, op2: OutPt, op2b: OutPt, Pt: Point, isDiscardLeft: boolean) {
        const direction1: Direction = op1.Pt.x > op1b.Pt.x ? Direction.dRightToLeft : Direction.dLeftToRight;
        const direction2: Direction = op2.Pt.x > op2b.Pt.x ? Direction.dRightToLeft : Direction.dLeftToRight;

        if (direction1 === direction2) {
            return false;
        }
        //When DiscardLeft, we want Op1b to be on the Left of Op1, otherwise we
        //want Op1b to be on the Right. (And likewise with Op2 and Op2b.)
        //So, to facilitate this while inserting Op1b and Op2b ...
        //when DiscardLeft, make sure we're AT or RIGHT of Pt before adding Op1b,
        //otherwise make sure we're AT or LEFT of Pt. (Likewise with Op2b.)
        if (direction1 === Direction.dLeftToRight) {
            while (op1.Next.Pt.x <= Pt.x && op1.Next.Pt.x >= op1.Pt.x && op1.Next.Pt.y === Pt.y) {
                op1 = op1.Next;
            }

            if (isDiscardLeft && op1.Pt.x !== Pt.x) {
                op1 = op1.Next;
            }

            op1b = op1.duplicate(!isDiscardLeft);

            if (!op1b.Pt.almostEqual(Pt)) {
                op1 = op1b;
                //op1.Pt = Pt;
                op1.Pt.update(Pt);
                op1b = op1.duplicate(!isDiscardLeft);
            }
        } else {
            while (op1.Next.Pt.x >= Pt.x && op1.Next.Pt.x <= op1.Pt.x && op1.Next.Pt.y === Pt.y) {
                op1 = op1.Next;
            }

            if (!isDiscardLeft && op1.Pt.x !== Pt.x) {
                op1 = op1.Next;
            }

            op1b = op1.duplicate(isDiscardLeft);

            if (!op1b.Pt.almostEqual(Pt)) {
                op1 = op1b;
                //op1.Pt = Pt;
                op1.Pt.update(Pt);
                op1b = op1.duplicate(isDiscardLeft);
            }
        }
        if (direction2 === Direction.dLeftToRight) {
            while (op2.Next.Pt.x <= Pt.x && op2.Next.Pt.x >= op2.Pt.x && op2.Next.Pt.y === Pt.y) {
                op2 = op2.Next;
            }

            if (isDiscardLeft && op2.Pt.x !== Pt.x) {
                op2 = op2.Next;
            }

            op2b = op2.duplicate(!isDiscardLeft);

            if (!op2b.Pt.almostEqual(Pt)) {
                op2 = op2b;
                //op2.Pt = Pt;
                op2.Pt.update(Pt);
                op2b = op2.duplicate(!isDiscardLeft);
            }
        } else {
            while (op2.Next.Pt.x >= Pt.x && op2.Next.Pt.x <= op2.Pt.x && op2.Next.Pt.y === Pt.y) {
                op2 = op2.Next;
            }

            if (!isDiscardLeft && op2.Pt.x !== Pt.x) {
                op2 = op2.Next;
            }

            op2b = op2.duplicate(isDiscardLeft);
            if (!op2b.Pt.almostEqual(Pt)) {
                op2 = op2b;
                //op2.Pt = Pt;
                op2.Pt.update(Pt);
                op2b = op2.duplicate(isDiscardLeft);
            }
        }

        if ((direction1 === Direction.dLeftToRight) === isDiscardLeft) {
            op1.Prev = op2;
            op2.Next = op1;
            op1b.Next = op2b;
            op2b.Prev = op1b;
        } else {
            op1.Next = op2;
            op2.Prev = op1;
            op1b.Prev = op2b;
            op2b.Next = op1b;
        }

        return true;
    }
}
