import PointBase from './point-base';
import { almostEqualF32 } from '../../helpers';
import type { Point } from '../../types';
import { TOL_F32 } from '../../constants';

export default class PointF32 extends PointBase<Float32Array> {
    public clone(point: Point = null): PointF32 {
        return PointF32.from(point !== null ? point : this);
    }

    public almostEqual(point: Point, tolerance: number = TOL_F32): boolean {
        return this.almostEqualX(point, tolerance) && this.almostEqualY(point, tolerance);
    }

    public almostEqualX(point: Point, tolerance: number = TOL_F32): boolean {
        return almostEqualF32(this.x, point.x, tolerance);
    }

    public almostEqualY(point: Point, tolerance: number = TOL_F32): boolean {
        return almostEqualF32(this.y, point.y, tolerance);
    }

    public static create(x: number = 0, y: number = 0): PointF32 {
        return new PointF32(new Float32Array([x, y]));
    }

    public static from(point: Point = null): PointF32 {
        return point !== null ? PointF32.create(point.x, point.y) : PointF32.create();
    }
}
