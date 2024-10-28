import Clipper from './clipper';
import { clipperRound, getArea, op_Equality } from './helpers';
import { ClipType, PolyFillType, PolyType } from './types';
import { cycleIndex } from '../helpers';
import Point from '../point';

export default class ClipperOffset {
    private srcPolygon: Point[] = [];

    public execute(polygon: Point[], delta: number): Point[][] {
        this.srcPolygon = this.formatPath(polygon);

        const result: Point[][] = [];
        const destPolygon = this.doOffset(delta);
        const clipper: Clipper = new Clipper();

        clipper.AddPath(destPolygon, PolyType.ptSubject);

        if (delta > 0) {
            clipper.Execute(ClipType.ctUnion, result, PolyFillType.pftPositive, PolyFillType.pftPositive);
        } else {
            const outer: Point[] = ClipperOffset.getOuterBounds(destPolygon);

            clipper.AddPath(outer, PolyType.ptSubject);
            clipper.ReverseSolution = true;
            clipper.Execute(ClipType.ctUnion, result, PolyFillType.pftNegative, PolyFillType.pftNegative);

            if (result.length > 0) {
                result.splice(0, 1);
            }
        }

        return result;
    }

    private formatPath(polygon: Point[]): Point[] {
        let highIndex: number = polygon.length - 1;
        let i: number = 0;
        let j: number = 0;

        //strip duplicate points from path and also get index to the lowest point ...
        while (highIndex > 0 && op_Equality(polygon[0], polygon[highIndex])) {
            --highIndex;
        }

        const result: Point[] = [];
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

    private doOffset(delta: number): Point[] {
        //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
        const pointCount: number = this.srcPolygon.length;
        let i: number = 0;

        const result: Point[] = [];

        if (pointCount == 1) {
            let X: number = -1;
            let Y: number = -1;

            for (i = 0; i < 4; ++i) {
                result.push(
                    Point.create(clipperRound(this.srcPolygon[0].x + X * delta), clipperRound(this.srcPolygon[0].y + Y * delta))
                );
                if (X < 0) {
                    X = 1;
                } else if (Y < 0) {
                    Y = 1;
                } else {
                    X = -1;
                }
            }
        } else {
            const normals: Point[] = [];
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

    private offsetPoint(polygon: Point[], normals: Point[], delta: number, i: number, k: number): number {
        let sinA: number = normals[k].x * normals[i].y - normals[i].x * normals[k].y;
        if (sinA < 0.00005 && sinA > -0.00005) return k;
        else if (sinA > 1) sinA = 1;
        else if (sinA < -1) sinA = -1;

        if (sinA * delta < 0) {
            polygon.push(
                Point.create(
                    clipperRound(this.srcPolygon[i].x + normals[k].x * delta),
                    clipperRound(this.srcPolygon[i].y + normals[k].y * delta)
                )
            );
            polygon.push(Point.from(this.srcPolygon[i]));
            polygon.push(
                Point.create(
                    clipperRound(this.srcPolygon[i].x + normals[i].x * delta),
                    clipperRound(this.srcPolygon[i].y + normals[i].y * delta)
                )
            );
        } else {
            const r: number = 1 + (normals[i].x * normals[k].x + normals[i].y * normals[k].y);

            // mitter
            if (r >= 1.8) {
                const q: number = delta / r;

                polygon.push(
                    Point.create(
                        clipperRound(this.srcPolygon[i].x + (normals[k].x + normals[i].x) * q),
                        clipperRound(this.srcPolygon[i].y + (normals[k].y + normals[i].y) * q)
                    )
                );
                // square
            } else {
                const dx: number = Math.tan(Math.atan2(sinA, normals[k].x * normals[i].x + normals[k].y * normals[i].y) / 4);
                polygon.push(
                    Point.create(
                        clipperRound(this.srcPolygon[i].x + delta * (normals[k].x - normals[k].y * dx)),
                        clipperRound(this.srcPolygon[i].y + delta * (normals[k].y + normals[k].x * dx))
                    )
                );
                polygon.push(
                    Point.create(
                        clipperRound(this.srcPolygon[i].x + delta * (normals[i].x + normals[i].y * dx)),
                        clipperRound(this.srcPolygon[i].y + delta * (normals[i].y - normals[i].x * dx))
                    )
                );
            }
        }

        k = i;
        return k;
    }

    private getUnitNormal(index: number): Point {
        const point1: Point = this.srcPolygon[index];
        const point2: Point = this.srcPolygon[cycleIndex(index, this.srcPolygon.length, 1)];
        const result: Point = Point.create(point2.y - point1.y, point1.x - point2.x);

        if (result.x === 0 && result.y === 0) {
            return result;
        }

        const distance: number = Math.sqrt(result.x * result.x + result.y * result.y);

        result.x /= distance;
        result.y /= distance;

        return result;
    }

    private static getOuterBounds(path: Point[]): Point[] {
        const pointCount: number = path.length;
        let left: number = path[0].x;
        let right: number = left;
        let top: number = path[0].y;
        let bottom: number = path[0].y;
        let point: Point = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = path[i];
            left = Math.min(point.x, left);
            right = Math.max(point.x, right);
            top = Math.min(point.y, top);
            bottom = Math.max(point.y, bottom);
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
