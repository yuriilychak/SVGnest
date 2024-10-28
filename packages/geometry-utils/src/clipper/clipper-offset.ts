import Clipper from './clipper';
import { clipperRound, getArea, op_Equality } from './helpers';
import { ClipType, IClipperPoint, PolyFillType, PolyType } from './types';
import { cycleIndex } from '../helpers';
import Point from './point';

export default class ClipperOffset {
    private srcPolygon: IClipperPoint[] = [];

    public execute(polygon: IClipperPoint[], delta: number): IClipperPoint[][] {
        this.srcPolygon = this.formatPath(polygon);

        const result: IClipperPoint[][] = [];
        const destPolygon = this.doOffset(delta);
        const clipper: Clipper = new Clipper();

        clipper.AddPath(destPolygon, PolyType.ptSubject);

        if (delta > 0) {
            clipper.Execute(ClipType.ctUnion, result, PolyFillType.pftPositive, PolyFillType.pftPositive);
        } else {
            const outer: IClipperPoint[] = ClipperOffset.getOuterBounds(destPolygon);

            clipper.AddPath(outer, PolyType.ptSubject);
            clipper.ReverseSolution = true;
            clipper.Execute(ClipType.ctUnion, result, PolyFillType.pftNegative, PolyFillType.pftNegative);

            if (result.length > 0) {
                result.splice(0, 1);
            }
        }

        return result;
    }

    private formatPath(polygon: IClipperPoint[]): IClipperPoint[] {
        let highIndex: number = polygon.length - 1;
        let i: number = 0;
        let j: number = 0;

        //strip duplicate points from path and also get index to the lowest point ...
        while (highIndex > 0 && op_Equality(polygon[0], polygon[highIndex])) {
            --highIndex;
        }

        const result: IClipperPoint[] = [];
        //newNode.m_polygon.set_Capacity(highI + 1);
        result.push(polygon[0]);

        for (i = 1; i <= highIndex; ++i) {
            if (!op_Equality(result[j], polygon[i])) {
                ++j;
                result.push(polygon[i]);
            }
        }

        if (j >= 2 && getArea(result) < 0) {
            result.reverse();
        }

        return result;
    }

    private doOffset(delta: number): IClipperPoint[] {
        //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
        const pointCount: number = this.srcPolygon.length;
        let i: number = 0;

        const result: IClipperPoint[] = [];

        if (pointCount == 1) {
            let X: number = -1;
            let Y: number = -1;

            for (i = 0; i < 4; ++i) {
                result.push({
                    X: clipperRound(this.srcPolygon[0].X + X * delta),
                    Y: clipperRound(this.srcPolygon[0].Y + Y * delta)
                });
                if (X < 0) {
                    X = 1;
                } else if (Y < 0) {
                    Y = 1;
                } else {
                    X = -1;
                }
            }
        } else {
            const normals: IClipperPoint[] = [];
            //this.m_normals.set_Capacity(len);
            for (i = 0; i < pointCount; ++i) {
                normals.push(this.getUnitNormal(i));
            }

            let k: number = pointCount - 1;

            for (i = 0; i < pointCount; ++i) {
                k = this.offsetPoint(result, normals, delta, i, k);
            }
        }

        return result;
    }

    private offsetPoint(polygon: IClipperPoint[], normals: IClipperPoint[], delta: number, i: number, k: number): number {
        let sinA: number = normals[k].X * normals[i].Y - normals[i].X * normals[k].Y;
        if (sinA < 0.00005 && sinA > -0.00005) return k;
        else if (sinA > 1) sinA = 1;
        else if (sinA < -1) sinA = -1;

        if (sinA * delta < 0) {
            polygon.push(
                Point.create(
                    clipperRound(this.srcPolygon[i].X + normals[k].X * delta),
                    clipperRound(this.srcPolygon[i].Y + normals[k].Y * delta)
                )
            );
            polygon.push(Point.from(this.srcPolygon[i]));
            polygon.push(
                Point.create(
                    clipperRound(this.srcPolygon[i].X + normals[i].X * delta),
                    clipperRound(this.srcPolygon[i].Y + normals[i].Y * delta)
                )
            );
        } else {
            const r: number = 1 + (normals[i].X * normals[k].X + normals[i].Y * normals[k].Y);

            // mitter
            if (r >= 1.8) {
                const q: number = delta / r;

                polygon.push({
                    X: clipperRound(this.srcPolygon[i].X + (normals[k].X + normals[i].X) * q),
                    Y: clipperRound(this.srcPolygon[i].Y + (normals[k].Y + normals[i].Y) * q)
                });
                // square
            } else {
                const dx: number = Math.tan(Math.atan2(sinA, normals[k].X * normals[i].X + normals[k].Y * normals[i].Y) / 4);
                polygon.push({
                    X: clipperRound(this.srcPolygon[i].X + delta * (normals[k].X - normals[k].Y * dx)),
                    Y: clipperRound(this.srcPolygon[i].Y + delta * (normals[k].Y + normals[k].X * dx))
                });
                polygon.push({
                    X: clipperRound(this.srcPolygon[i].X + delta * (normals[i].X + normals[i].Y * dx)),
                    Y: clipperRound(this.srcPolygon[i].Y + delta * (normals[i].Y - normals[i].X * dx))
                });
            }
        }

        k = i;
        return k;
    }

    private getUnitNormal(index: number): IClipperPoint {
        const point1: IClipperPoint = this.srcPolygon[index];
        const point2: IClipperPoint = this.srcPolygon[cycleIndex(index, this.srcPolygon.length, 1)];
        const result: IClipperPoint = Point.create(point2.Y - point1.Y, point1.X - point2.X);

        if (result.X === 0 && result.Y === 0) {
            return result;
        }

        const distance: number = Math.sqrt(result.X * result.X + result.Y * result.Y);

        result.X /= distance;
        result.Y /= distance;

        return result;
    }

    private static getOuterBounds(path: IClipperPoint[]): IClipperPoint[] {
        const pointCount: number = path.length;
        let left: number = path[0].X;
        let right: number = left;
        let top: number = path[0].Y;
        let bottom: number = path[0].Y;
        let point: IClipperPoint = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = path[i];
            left = Math.min(point.X, left);
            right = Math.max(point.X, right);
            top = Math.min(point.Y, top);
            bottom = Math.max(point.Y, bottom);
        }

        return [
            Point.create(left - 10, bottom + 10),
            Point.create(right + 10, bottom + 10),
            Point.create(right + 10, top - 10),
            Point.create(left - 10, top - 10)
        ];
    }

    public static create(): ClipperOffset {
        return new ClipperOffset();
    }
}
