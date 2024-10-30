import Clipper from './clipper';
import { getArea } from './helpers';
import { CLIP_TYPE, POLY_FILL_TYPE, POLY_TYPE } from './types';
import { cycleIndex } from '../helpers';
import Point from '../point';

export default class ClipperOffset {
    private srcPolygon: Point[] = [];

    public execute(polygon: Point[], delta: number): Point[][] {
        this.srcPolygon = this.formatPath(polygon);

        const result: Point[][] = [];
        const destPolygon = this.doOffset(delta);
        const clipper: Clipper = new Clipper();

        clipper.addPath(destPolygon, POLY_TYPE.SUBJECT);

        if (delta > 0) {
            clipper.execute(CLIP_TYPE.UNION, result, POLY_FILL_TYPE.POSITIVE);
        } else {
            const outer: Point[] = ClipperOffset.getOuterBounds(destPolygon);

            clipper.addPath(outer, POLY_TYPE.SUBJECT);
            clipper.ReverseSolution = true;
            clipper.execute(CLIP_TYPE.UNION, result, POLY_FILL_TYPE.NEGATIVE);

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
        while (highIndex > 0 && polygon[0].almostEqual(polygon[highIndex])) {
            --highIndex;
        }

        const result: Point[] = [];
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

    private doOffset(delta: number): Point[] {
        //this.m_destPolys.set_Capacity(this.m_polyNodes.ChildCount * 2);
        const pointCount: number = this.srcPolygon.length;
        const result: Point[] = [];
        let i: number = 0;

        if (pointCount == 1) {
            const point: Point = Point.create(-1, -1);

            for (i = 0; i < 4; ++i) {
                result.push(Point.from(point).scaleUp(delta).add(this.srcPolygon[0]));

                if (point.x < 0) {
                    point.x = 1;
                } else if (point.y < 0) {
                    point.y = 1;
                } else {
                    point.x = -1;
                }
            }
        } else {
            const normals: Point[] = new Array(pointCount);
            //this.m_normals.set_Capacity(len);
            for (i = 0; i < pointCount; ++i) {
                normals[i] = Point.from(this.srcPolygon[cycleIndex(i, this.srcPolygon.length, 1)])
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

    private offsetPoint(polygon: Point[], normals: Point[], delta: number, i: number, k: number): number {
        let sinA: number = normals[i].cross(normals[k]);

        if (Math.abs(sinA) < 0.00005) {
            return k;
        }

        if (sinA > 1) {
            sinA = 1;
        } else if (sinA < -1) {
            sinA = -1;
        }

        const currentPoint: Point = this.srcPolygon[i];
        const normal1: Point = normals[i];
        const normal2: Point = normals[k];

        if (sinA * delta < 0) {
            polygon.push(Point.from(normal2).scaleUp(delta).add(currentPoint).clipperRound());
            polygon.push(Point.from(currentPoint));
            polygon.push(Point.from(normal1).scaleUp(delta).add(currentPoint).clipperRound());
        } else {
            const r: number = 1 + normal1.dot(normal2);

            // mitter
            if (r >= 1.8) {
                const q: number = delta / r;

                polygon.push(Point.from(normal2).add(normal1).scaleUp(q).add(currentPoint).clipperRound());
                // square
            } else {
                const dx: number = Math.tan(Math.atan2(sinA, normal2.dot(normal1)) * 0.25);

                polygon.push(Point.from(normal2).normal().scaleUp(dx).reverse().add(normal2).scaleUp(delta).add(currentPoint));
                polygon.push(Point.from(normal1).normal().scaleUp(dx).add(normal1).scaleUp(delta).add(currentPoint));
            }
        }

        return i;
    }

    private static getOuterBounds(path: Point[]): Point[] {
        const pointCount: number = path.length;
        let left: number = path[0].x;
        let right: number = path[0].x;
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
