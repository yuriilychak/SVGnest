import { TOL } from '../constants';
import { almostEqual, midValue } from '../helpers';
import PointBase from './point-base';
import type { Point } from '../types';

export default class PointF32 extends PointBase<Float32Array> {
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

        const subA = PointF32.from(this).sub(pointA);
        const subAB = PointF32.from(pointB).sub(pointA);

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


    public static create(x: number, y: number): PointF32 {
        const data = new Float32Array(2);
        data[0] = x;
        data[1] = y;

        return new PointF32(data);
    }

    public static zero(): PointF32 {
        return PointF32.create(0, 0);
    }

    public static from(point: Point): PointF32 {
        return PointF32.create(point.x, point.y);
    }

    public static pointsAreClose(point1: Point, point2: Point, distSqrd: number): boolean {
        return PointF32.from(point1).len2(point2) <= distSqrd;
    }
}
