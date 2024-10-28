import { GetDx, op_Equality } from './helpers';
import Point from './point';
import { IClipperPoint } from './types';

export default class OutPt {
    public Idx: number;

    public Pt: IClipperPoint;

    public Next: OutPt | null;

    public Prev: OutPt | null;

    constructor() {
        this.Idx = 0;
        this.Pt = Point.zero();
        this.Next = null;
        this.Prev = null;
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

    public pointIn(pt: IClipperPoint): number {
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
            poly0x = outPt.Pt.X;
            poly0y = outPt.Pt.Y;
            poly1x = outPt.Next.Pt.X;
            poly1y = outPt.Next.Pt.Y;

            if (poly1y === pt.Y) {
                if (poly1x === pt.X || (poly0y === pt.Y && poly1x > pt.X === poly0x < pt.X)) {
                    return -1;
                }
            }

            if (poly0y < pt.Y !== poly1y < pt.Y) {
                if (poly0x >= pt.X) {
                    if (poly1x > pt.X) {
                        result = 1 - result;
                    } else {
                        d = (poly0x - pt.X) * (poly1y - pt.Y) - (poly1x - pt.X) * (poly0y - pt.Y);

                        if (d == 0) {
                            return -1;
                        }

                        if (d > 0 === poly1y > poly0y) {
                            result = 1 - result;
                        }
                    }
                } else {
                    if (poly1x > pt.X) {
                        d = (poly0x - pt.X) * (poly1y - pt.Y) - (poly1x - pt.X) * (poly0y - pt.Y);

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
            if (outPt2.Pt.Y > outPt1.Pt.Y) {
                outPt1 = outPt2;
                dups = null;
            } else if (outPt2.Pt.Y == outPt1.Pt.Y && outPt2.Pt.X <= outPt1.Pt.X) {
                if (outPt2.Pt.X < outPt1.Pt.X) {
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
                while (!op_Equality(dups.Pt, outPt1.Pt)) {
                    dups = dups.Next;
                }
            }
        }
        return outPt1;
    }

    public static firstIsBottomPt(btmPt1: OutPt, btmPt2: OutPt): boolean {
        let p: OutPt = btmPt1.Prev;
        while (op_Equality(p.Pt, btmPt1.Pt) && p != btmPt1) {
            p = p.Prev;
        }

        let dx1p: number = Math.abs(GetDx(btmPt1.Pt, p.Pt));
        p = btmPt1.Next;
        while (op_Equality(p.Pt, btmPt1.Pt) && p != btmPt1) {
            p = p.Next;
        }

        let dx1n: number = Math.abs(GetDx(btmPt1.Pt, p.Pt));

        p = btmPt2.Prev;

        while (op_Equality(p.Pt, btmPt2.Pt) && p != btmPt2) {
            p = p.Prev;
        }

        let dx2p: number = Math.abs(GetDx(btmPt2.Pt, p.Pt));

        p = btmPt2.Next;

        while (op_Equality(p.Pt, btmPt2.Pt) && p != btmPt2) {
            p = p.Next;
        }
        let dx2n: number = Math.abs(GetDx(btmPt2.Pt, p.Pt));

        return (dx1p >= dx2p && dx1p >= dx2n) || (dx1n >= dx2p && dx1n >= dx2n);
    }
}
