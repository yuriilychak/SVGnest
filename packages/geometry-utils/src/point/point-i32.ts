import PointBase from './point-base';
import type { Point } from '../types';

export default class PointI32 extends PointBase<Int32Array> {
    public clone(point: Point = null): PointI32 {
        return PointI32.from(point !== null ? point : this);
    }

    public static create(x: number = 0, y: number = 0): PointI32 {
        return new PointI32(new Int32Array([x, y]));
    }

    public static from(point: Point = null): PointI32 {
        return point !== null ? PointI32.create(point.x, point.y) : PointI32.create();
    }
}
