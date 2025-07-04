import { PointI32 } from "../geometry";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./t-edge";
import { DIRECTION, NullPtr } from "./types";

export default class OutRecManager {
    private polyOuts: OutRec[] = [];

    public createRec(pointer: OutPt, isOpen: boolean = false) {
        const result: OutRec = new OutRec(this.polyOuts.length, isOpen, pointer);

        this.polyOuts.push(result);

        return result;
    }

    public getOutRec(idx: number): OutRec {
        let result: OutRec = this.polyOuts[idx];

        while (result.index !== this.polyOuts[result.currentIndex].index) {
            result = this.polyOuts[result.currentIndex];
        }

        return result;
    }

    public getJoinData(horzEdge: TEdge) {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        let outPt: NullPtr<OutPt> = this.polyOuts[horzEdge.index].points;

        if (horzEdge.Side === DIRECTION.RIGHT) {
            outPt = outPt.prev;
        }

        const offPoint: PointI32 = outPt.point.almostEqual(horzEdge.Top) ? horzEdge.Bot : horzEdge.Top;

        return { outPt, offPoint };
    }

    public addOutPt(edge: TEdge, point: PointI32): OutPt {
        const isToFront: boolean = edge.Side === DIRECTION.LEFT;
        let outRec: OutRec = null;
        let newOp: OutPt = null;

        if (!edge.isAssigned) {
            newOp = new OutPt(0, point);
            outRec = this.createRec(newOp, edge.isWindDeletaEmpty);
            newOp.index = outRec.currentIndex;
            newOp.next = newOp;
            newOp.prev = newOp;

            if (!outRec.isOpen) {
                this.setHoleState(outRec, edge);
            }

            edge.index = outRec.currentIndex;
            //nb: do this after SetZ !
            return newOp;
        }

        outRec = this.polyOuts[edge.index];
        //OutRec.Pts is the 'Left-most' point & OutRec.Pts.Prev is the 'Right-most'
        const op: OutPt = outRec.points;

        if (isToFront && point.almostEqual(op.point)) {
            return op;
        }

        if (!isToFront && point.almostEqual(op.prev.point)) {
            return op.prev;
        }

        newOp = op.insertBefore(outRec.currentIndex, point);

        if (isToFront) {
            outRec.points = newOp;
        }

        return newOp;
    }

    public addLocalMaxPoly(edge1: TEdge, edge2: TEdge, point: PointI32, activeEdge: TEdge): void {
        this.addOutPt(edge1, point);

        if (edge2.isWindDeletaEmpty) {
            this.addOutPt(edge2, point);
        }

        if (edge1.index === edge2.index) {
            edge1.unassign();
            edge2.unassign();
            return;
        }

        const firstEdge: TEdge = edge1.index < edge2.index ? edge1 : edge2;
        const secondEdge: TEdge = edge1.index < edge2.index ? edge2 : edge1;

        //get the start and ends of both output polygons ...
        const outRec1: OutRec = this.polyOuts[firstEdge.index];
        const outRec2: OutRec = this.polyOuts[secondEdge.index];
        const holeStateRec: OutRec = this.getHoleStateRec(outRec1, outRec2);
        const p1_lft: OutPt = outRec1.points;
        const p1_rt: OutPt = p1_lft.prev;
        const p2_lft: OutPt = outRec2.points;
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
                outRec1.points = p2_rt;
            } else {
                //x y z a b c
                p2_rt.next = p1_lft;
                p1_lft.prev = p2_rt;
                p2_lft.prev = p1_rt;
                p1_rt.next = p2_lft;
                outRec1.points = p2_lft;
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

        if (holeStateRec === outRec2) {
            if (outRec2.firstLeftIndex !== outRec1.index) {
                outRec1.firstLeftIndex = outRec2.firstLeftIndex;
            }

            outRec1.isHole = outRec2.isHole;
        }

        outRec2.points = null;
        outRec2.firstLeftIndex = outRec1.index;
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

        outRec2.currentIndex = outRec1.currentIndex;
    }

    public fixupOutPolygon(isUseFullRange: boolean): void {
        const outRecCount = this.polyOuts.length;
        let i: number = 0;
        let outRec: OutRec = null;

        for (i = 0; i < outRecCount; ++i) {
            outRec = this.polyOuts[i];

            if (!outRec.isEmpty) {
                outRec.fixupOutPolygon(false, isUseFullRange);
            }
        }
    }

    public fixOrientation(reverseSolution: boolean): void {
        const outRecCount = this.polyOuts.length;
        let i: number = 0;
        let outRec = null;

        for (i = 0; i < outRecCount; ++i) {
            outRec = this.polyOuts[i];

            if (outRec.isEmpty) {
                continue;
            }

            if ((outRec.isHole !== reverseSolution) === outRec.area > 0) {
                outRec.reversePts();
            }
        }
    }

    public buildResult(polygons: PointI32[][]): void {
        const polygonCount = this.polyOuts.length;
        let outRec: OutRec = null;
        let polygon: NullPtr<PointI32[]> = null;
        let i: number = 0;

        for (i = 0; i < polygonCount; ++i) {
            outRec = this.polyOuts[i];
            polygon = outRec.export();

            if (polygon !== null) {
                polygons.push(polygon);
            }
        }
    }

    public disposeAllPolyPts(): void {
        const polyCount: number = this.polyOuts.length;
        let outRec: OutRec = null;
        let i: number = 0;

        for (i = 0; i < polyCount; ++i) {
            outRec = this.polyOuts[i];
            outRec.dispose();
        }

        this.polyOuts = [];
    }

    public doSimplePolygons(): void {
        let i: number = 0;
        let outPt: OutPt = null;
        let outRec: OutRec = null;

        while (i < this.polyOuts.length) {
            outRec = this.polyOuts[i++];
            outPt = outRec.points;

            if (outPt !== null) {
                this.simplify(outRec, outPt);
            }
        }
    }

    public simplify(inputOutRec: OutRec, outPt: OutPt): void {
        let outRec: OutRec = null;
        let op2: OutPt = null;
        let op3: OutPt = null;
        let op4: OutPt = null;

        do //for each Pt in Polygon until duplicate found do ...
        {
            op2 = outPt.next;

            while (op2 !== inputOutRec.points) {
                if (outPt.point.almostEqual(op2.point) && op2.next != outPt && op2.prev != outPt) {
                    //split the polygon into two ...
                    op3 = outPt.prev;
                    op4 = op2.prev;
                    outPt.prev = op4;
                    op4.next = outPt;
                    op2.prev = op3;
                    op3.next = op2;
                    inputOutRec.points = outPt;
                    outRec = this.createRec(op2);
                    outRec.updateOutPtIdxs();

                    if (inputOutRec.containsPoly(outRec)) {
                        //OutRec2 is contained by OutRec1 ...
                        outRec.isHole = !inputOutRec.isHole;
                        outRec.firstLeftIndex = inputOutRec.index;
                    } else if (outRec.containsPoly(inputOutRec)) {
                        //OutRec1 is contained by OutRec2 ...
                        outRec.isHole = inputOutRec.isHole;
                        inputOutRec.isHole = !outRec.isHole;
                        outRec.firstLeftIndex = inputOutRec.firstLeftIndex;
                        inputOutRec.firstLeftIndex = outRec.index;
                    } else {
                        //the 2 polygons are separate ...
                        outRec.isHole = inputOutRec.isHole;
                        outRec.firstLeftIndex = inputOutRec.firstLeftIndex;
                    }
                    op2 = outPt;
                    //ie get ready for the next iteration
                }
                op2 = op2.next;
            }
            outPt = outPt.next;
        } while (outPt != inputOutRec.points);
    }

    private setHoleState(outRec: OutRec, tEdge: TEdge): void {
        let isHole: boolean = false;
        let edge: NullPtr<TEdge> = tEdge.PrevInAEL;

        while (edge !== null) {
            if (edge.isAssigned && !edge.isWindDeletaEmpty) {
                isHole = !isHole;

                if (outRec.firstLeftIndex === -1) {
                    outRec.firstLeftIndex = this.polyOuts[edge.index].index;
                }
            }

            edge = edge.PrevInAEL;
        }

        if (isHole) {
            outRec.isHole = true;
        }
    }

    public joinCommonEdge(index1: number, index2: number, outPt1: OutPt, outPt2: OutPt, isReverseSolution: boolean): void {
        const outRec1: NullPtr<OutRec> = this.getOutRec(index1);
        let outRec2: NullPtr<OutRec> = this.getOutRec(index2);

        if (outRec1 === outRec2) {
            //instead of joining two polygons, we've just created a new one by
            //splitting one polygon into two.
            outRec1.points = outPt1;
            outRec2 = this.createRec(outPt2);
            //update all OutRec2.Pts Idx's ...
            outRec2.updateOutPtIdxs();

            outRec2.isHole = !outRec2.isHole;
            outRec2.firstLeftIndex = outRec2.index;

            if ((outRec2.isHole !== isReverseSolution) === outRec2.area > 0) {
                outRec2.points.reverse();
            }

            return;
        }

        const holeStateRec: OutRec = this.getHoleStateRec(outRec1, outRec2);
        //joined 2 polygons together ...
        outRec2.points = null;
        outRec2.currentIndex = outRec1.currentIndex;
        outRec1.isHole = holeStateRec.isHole;

        if (holeStateRec === outRec2) {
            outRec1.firstLeftIndex = outRec2.firstLeftIndex;
        }

        outRec2.firstLeftIndex = outRec1.index;
    }

    private param1RightOfParam2(outRec1: OutRec, outRec2: OutRec): boolean {
        let outRec1Index = outRec1.index;
        let outRec2Index = outRec2.index;

        do {
            outRec1Index = this.getFirstLeftIndex(outRec1Index);

            if (outRec1Index == outRec2Index) {
                return true;
            }
        } while (outRec1Index !== -1);

        return false;
    }

    private getFirstLeftIndex(index: number): number {
        return index !== -1 ? this.polyOuts[index].firstLeftIndex : -1;
    }

    private static getLowermostRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        const bPt1: NullPtr<OutPt> = outRec1.points.getBottomPt();
        const bPt2: NullPtr<OutPt> = outRec2.points.getBottomPt();

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

    private getHoleStateRec(outRec1: OutRec, outRec2: OutRec): OutRec {
        switch (true) {
            case this.param1RightOfParam2(outRec1, outRec2):
                return outRec2;
            case this.param1RightOfParam2(outRec2, outRec1):
                return outRec1;
            default:
                return OutRecManager.getLowermostRec(outRec1, outRec2);
        }
    }
}