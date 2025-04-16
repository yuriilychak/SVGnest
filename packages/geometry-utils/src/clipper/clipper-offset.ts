import Clipper from './clipper';
import { getArea } from './helpers';
import { CLIP_TYPE, POLY_FILL_TYPE, POLY_TYPE } from './types';
import { cycleIndex } from '../helpers';
import { PointF64 } from '../point';

export default class ClipperOffset {
    private srcPolygon: PointF64[] = [];

    public execute(polygon: PointF64[], delta: number): PointF64[][] {
        this.srcPolygon = this.formatPath(polygon);

        const result: PointF64[][] = [];
        const destPolygon = this.doOffset(delta);
        const clipper: Clipper = new Clipper();

        clipper.addPath(destPolygon, POLY_TYPE.SUBJECT);

        if (delta > 0) {
            clipper.execute(CLIP_TYPE.UNION, result, POLY_FILL_TYPE.POSITIVE);
        } else {
            const outer: PointF64[] = ClipperOffset.getOuterBounds(destPolygon);

            clipper.addPath(outer, POLY_TYPE.SUBJECT);
            clipper.ReverseSolution = true;
            clipper.execute(CLIP_TYPE.UNION, result, POLY_FILL_TYPE.NEGATIVE);

            if (result.length > 0) {
                result.splice(0, 1);
            }
        }

        return result;
    }

    private formatPath(polygon: PointF64[]): PointF64[] {
        let highIndex: number = polygon.length - 1;
        let i: number = 0;
        let j: number = 0;

        //strip duplicate points from path and also get index to the lowest point ...
        while (highIndex > 0 && polygon[0].almostEqual(polygon[highIndex])) {
            --highIndex;
        }

        const result: PointF64[] = [];
        //newNode.m_polygon.set_Capacity(highI + 1);
        result.push(polygon[0]);

        for (i = 1; i <= highIndex; ++i) {
            if (!result[j].almostEqual(polygon[i])) {
                ++j;
                result.push(polygon[i]);
            }
        }

        if (j >= 2 && getArea(result) < 0) {
            result.reverse();
        }

        return result;
    }

    private doOffset(delta: number): PointF64[] {
        //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
        const pointCount: number = this.srcPolygon.length;
        const result: PointF64[] = [];
        let i: number = 0;

        if (pointCount == 1) {
            const point: PointF64 = PointF64.create(-1, -1);

            for (i = 0; i < 4; ++i) {
                result.push(PointF64.from(point).scaleUp(delta).add(this.srcPolygon[0]));

                if (point.x < 0) {
                    point.x = 1;
                } else if (point.y < 0) {
                    point.y = 1;
                } else {
                    point.x = -1;
                }
            }
        } else {
            const normals: PointF64[] = new Array(pointCount);
            //this.m_normals.set_Capacity(len);
            for (i = 0; i < pointCount; ++i) {
                normals[i] = PointF64.from(this.srcPolygon[cycleIndex(i, this.srcPolygon.length, 1)])
                    .sub(this.srcPolygon[i])
                    .normal()
                    .normalize();
            }

            let k: number = pointCount - 1;

            for (i = 0; i < pointCount; ++i) {
                k = this.offsetPoint(result, normals, delta, i, k);
            }
        }

        return result;
    }

    private offsetPoint(polygon: PointF64[], normals: PointF64[], delta: number, i: number, k: number): number {
        let sinA: number = normals[i].cross(normals[k]);

        if (Math.abs(sinA) < 0.00005) {
            return k;
        }

        if (sinA > 1) {
            sinA = 1;
        } else if (sinA < -1) {
            sinA = -1;
        }

        const currentPoint: PointF64 = this.srcPolygon[i];
        const normal1: PointF64 = normals[i];
        const normal2: PointF64 = normals[k];

        if (sinA * delta < 0) {
            polygon.push(PointF64.from(normal2).scaleUp(delta).add(currentPoint).clipperRound());
            polygon.push(PointF64.from(currentPoint));
            polygon.push(PointF64.from(normal1).scaleUp(delta).add(currentPoint).clipperRound());
        } else {
            const r: number = 1 + normal1.dot(normal2);

            // mitter
            if (r >= 1.8) {
                const q: number = delta / r;

                polygon.push(PointF64.from(normal2).add(normal1).scaleUp(q).add(currentPoint).clipperRound());
                // square
            } else {
                const dx: number = Math.tan(Math.atan2(sinA, normal2.dot(normal1)) * 0.25);

                polygon.push(PointF64.from(normal2).normal().scaleUp(dx).reverse().add(normal2).scaleUp(delta).add(currentPoint));
                polygon.push(PointF64.from(normal1).normal().scaleUp(dx).add(normal1).scaleUp(delta).add(currentPoint));
            }
        }

        return i;
    }

    private static getOuterBounds(path: PointF64[]): PointF64[] {
        const pointCount: number = path.length;
        let left: number = path[0].x;
        let right: number = path[0].x;
        let top: number = path[0].y;
        let bottom: number = path[0].y;
        let point: PointF64 = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = path[i];
            left = Math.min(point.x, left);
            right = Math.max(point.x, right);
            top = Math.min(point.y, top);
            bottom = Math.max(point.y, bottom);
        }

        return [
            PointF64.create(left - 10, bottom + 10),
            PointF64.create(right + 10, bottom + 10),
            PointF64.create(right + 10, top - 10),
            PointF64.create(left - 10, top - 10)
        ];
    }

    public static create(): ClipperOffset {
        return new ClipperOffset();
    }
}
