import { PointI32 } from "../geometry";
import OutPt from "./out-pt";
import OutRec from "./out-rec";
import TEdge from "./t-edge";
import { DIRECTION, NullPtr } from "./types";

export default class OutRecManager {
    public polyOuts: OutRec[] = [];

    public getJoinData(horzEdge: TEdge) {
        //get the last Op for this horizontal edge
        //the point may be anywhere along the horizontal ...
        let outPt: NullPtr<OutPt> = this.polyOuts[horzEdge.index].Pts;

        if (horzEdge.Side === DIRECTION.RIGHT) {
            outPt = outPt.prev;
        }

        const offPoint: PointI32 = outPt.point.almostEqual(horzEdge.Top) ? horzEdge.Bot : horzEdge.Top;

        return { outPt, offPoint };
    }

    public addOutPt(edge: TEdge, point1: PointI32): OutPt {
        return OutRec.addOutPt(this.polyOuts, edge, point1);
    }

    public addLocalMaxPoly(edge1: TEdge, edge2: TEdge, point: PointI32, activeEdge: TEdge): void {
        OutRec.addLocalMaxPoly(this.polyOuts, edge1, edge2, point, activeEdge);
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

            if ((outRec.IsHole !== reverseSolution) === outRec.area > 0) {
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
            outPt = outRec.Pts;

            if (outPt !== null) {
                outRec.simplify(outPt, this.polyOuts);
            }
        }
    }
}