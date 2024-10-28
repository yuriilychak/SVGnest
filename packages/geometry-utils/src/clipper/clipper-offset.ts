import Clipper from './clipper';
import { clipperRound, getArea, op_Equality } from './helpers';
import { ClipType, IntPoint, PolyFillType, PolyType } from './types';
import { cycleIndex } from '../helpers';

export default class ClipperOffset {
    private srcPolygon: IntPoint[] = [];

    public execute(polygon: IntPoint[], delta: number): IntPoint[][] {
        this.srcPolygon = this.formatPath(polygon);

        const result: IntPoint[][] = [];
        const destPolygon = this.doOffset(delta);
        const clipper: Clipper = new Clipper();

        clipper.AddPath(destPolygon, PolyType.ptSubject);

        if (delta > 0) {
            clipper.Execute(ClipType.ctUnion, result, PolyFillType.pftPositive, PolyFillType.pftPositive);
        } else {
            const outer: IntPoint[] = ClipperOffset.getOuterBounds(destPolygon);

            clipper.AddPath(outer, PolyType.ptSubject);
            clipper.ReverseSolution = true;
            clipper.Execute(ClipType.ctUnion, result, PolyFillType.pftNegative, PolyFillType.pftNegative);

            if (result.length > 0) {
                result.splice(0, 1);
            }
        }

        return result;
    }

    private formatPath(polygon: IntPoint[]): IntPoint[] {
        let highIndex: number = polygon.length - 1;
        let i: number = 0;
        let j: number = 0;

        //strip duplicate points from path and also get index to the lowest point ...
        while (highIndex > 0 && op_Equality(polygon[0], polygon[highIndex])) {
            --highIndex;
        }

        const result: IntPoint[] = [];
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

    private doOffset(delta: number): IntPoint[] {
        //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
        const pointCount: number = this.srcPolygon.length;
        let i: number = 0;

        const result: IntPoint[] = [];

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
            const normals: IntPoint[] = [];
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

    private offsetPoint(polygon: IntPoint[], normals: IntPoint[], delta: number, i: number, k: number): number {
        let sinA: number = normals[k].X * normals[i].Y - normals[i].X * normals[k].Y;
        if (sinA < 0.00005 && sinA > -0.00005) return k;
        else if (sinA > 1) sinA = 1;
        else if (sinA < -1) sinA = -1;

        if (sinA * delta < 0) {
            polygon.push({
                X: clipperRound(this.srcPolygon[i].X + normals[k].X * delta),
                Y: clipperRound(this.srcPolygon[i].Y + normals[k].Y * delta)
            });
            polygon.push({ X: this.srcPolygon[i].X, Y: this.srcPolygon[i].Y });
            polygon.push({
                X: clipperRound(this.srcPolygon[i].X + normals[i].X * delta),
                Y: clipperRound(this.srcPolygon[i].Y + normals[i].Y * delta)
            });
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

    private getUnitNormal(index: number): IntPoint {
        const point1: IntPoint = this.srcPolygon[index];
        const point2: IntPoint = this.srcPolygon[cycleIndex(index, this.srcPolygon.length, 1)];
        const result: IntPoint = { X: point2.Y - point1.Y, Y: point1.X - point2.X };

        if (result.X === 0 && result.Y === 0) {
            return result;
        }

        const distance: number = Math.sqrt(result.X * result.X + result.Y * result.Y);

        result.X /= distance;
        result.Y /= distance;

        return result;
    }

    private static getOuterBounds(path: IntPoint[]): IntPoint[] {
        const pointCount: number = path.length;
        let left: number = path[0].X;
        let right: number = left;
        let top: number = path[0].Y;
        let bottom: number = path[0].Y;
        let point: IntPoint = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = path[i];
            left = Math.min(point.X, left);
            right = Math.max(point.X, right);
            top = Math.min(point.Y, top);
            bottom = Math.max(point.Y, bottom);
        }

        return [
            { X: left - 10, Y: bottom + 10 },
            { X: right + 10, Y: bottom + 10 },
            { X: right + 10, Y: top - 10 },
            { X: left - 10, Y: top - 10 }
        ];
    }

    public static create(): ClipperOffset {
        return new ClipperOffset();
    }
}
