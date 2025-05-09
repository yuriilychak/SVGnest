import PointBase from './point-base';
import type { Point } from '../../types';
import { almostEqual, midValue } from '../../helpers';
import { TOL_F64 } from '../../constants';

export default class PointF64 extends PointBase<Float64Array> {
    public clone(point: Point = null): PointF64 {
        return PointF64.from(point !== null ? point : this);
    }

    public almostEqual(point: Point, tolerance: number = TOL_F64): boolean {
        return almostEqual(this.x, point.x, tolerance) && almostEqual(this.y, point.y, tolerance);
    }

    public static create(x: number = 0, y: number = 0): PointF64 {
        return new PointF64(new Float64Array([x, y]));
    }

    public static from(point: Point = null): PointF64 {
        return point !== null ? PointF64.create(point.x, point.y) : PointF64.create();
    }
}
