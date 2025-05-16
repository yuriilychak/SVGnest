import PointBase from './point-base';
import type { Point } from '../../types';
export default class PointF64 extends PointBase<Float64Array> {
    public clone(point: Point = null): PointF64 {
        return PointF64.from(point !== null ? point : this);
    }

    public static create(x: number = 0, y: number = 0): PointF64 {
        return new PointF64(new Float64Array([x, y]));
    }

    public static from(point: Point = null): PointF64 {
        return point !== null ? PointF64.create(point.x, point.y) : PointF64.create();
    }
}
