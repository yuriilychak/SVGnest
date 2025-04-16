import { TOL } from '../constants';
import { almostEqual, midValue } from '../helpers';
import PointBase from './point-base';
import type { Point } from '../types';

export default class PointF64 extends PointBase<Float64Array> {
    public onSegment(pointA: Point, pointB: Point): boolean {
        const midX: number = midValue(this.x, pointA.x, pointB.x);
        const midY: number = midValue(this.y, pointA.y, pointB.y);

        // vertical line
        if (almostEqual(pointA.x, pointB.x) && almostEqual(this.x, pointA.x)) {
            return !almostEqual(this.y, pointB.y) && !almostEqual(this.y, pointA.y) && midY < 0;
        }

        // horizontal line
        if (almostEqual(pointA.y, pointB.y) && almostEqual(this.y, pointA.y)) {
            return !almostEqual(this.x, pointB.x) && !almostEqual(this.x, pointA.x) && midX < 0;
        }

        if (
            // range check
            midX > 0 ||
            midY > 0 ||
            // exclude end points
            this.almostEqual(pointA) ||
            this.almostEqual(pointB)
        ) {
            return false;
        }

        const subA = PointF64.from(this).sub(pointA);
        const subAB = PointF64.from(pointB).sub(pointA);

        if (Math.abs(subA.cross(subAB)) > TOL) {
            return false;
        }

        const dot = subA.dot(subAB);

        if (dot < TOL) {
            return false;
        }

        const len2 = pointA.len2(pointB);

        return !(dot > len2 || almostEqual(dot, len2));
    }

    public static create(x: number, y: number): PointF64 {
        const data = new Float64Array(2);
        data[0] = x;
        data[1] = y;

        return new PointF64(data);
    }

    public static zero(): PointF64 {
        return PointF64.create(0, 0);
    }

    public static from(point: Point): PointF64 {
        return PointF64.create(point.x, point.y);
    }

    public static pointsAreClose(point1: Point, point2: Point, distSqrd: number): boolean {
        return PointF64.from(point1).len2(point2) <= distSqrd;
    }
}
