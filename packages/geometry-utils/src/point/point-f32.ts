import PointBase from './point-base';
import type { Point } from '../types';

export default class PointF32 extends PointBase<Float32Array> {
    public clone(point: Point = null): PointF32 {
        return PointF32.from(point !== null ? point : this);
    }

    public static create(x: number = 0, y: number = 0): PointF32 {
        return new PointF32(new Float32Array([x, y]));
    }

    public static from(point: Point = null): PointF32 {
        return point !== null ? PointF32.create(point.x, point.y) : PointF32.create();
    }
}
