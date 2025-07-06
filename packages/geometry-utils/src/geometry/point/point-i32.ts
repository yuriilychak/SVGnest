import PointBase from './point-base';
import type { Point } from '../../types';

export default class PointI32 extends PointBase<Int32Array> {
    public clone(point: Point = null): PointI32 {
        return PointI32.from(point !== null ? point : this);
    }
    
    public static slopesNearCollinear(line1: PointI32, point: PointI32, line2: PointI32, trashold: number) {
        const equation: number[] = PointI32.lineEquation(line2, line1);
        const c: number = equation[0] * point.x + equation[1] * point.y - equation[2];
        const distance: number = (c * c) / (equation[0] * equation[0] + equation[1] * equation[1]);

        return distance < trashold;
    }
    

    public static create(x: number = 0, y: number = 0): PointI32 {
        return new PointI32(new Int32Array([x, y]));
    }

    public static from(point: Point = null): PointI32 {
        return point !== null ? PointI32.create(point.x, point.y) : PointI32.create();
    }

    public static getOverlap(a1: number, a2: number, b1: number, b2: number): PointI32 {
        if (a1 < a2) {
            return b1 < b2
                ? PointI32.create(Math.max(a1, b1), Math.min(a2, b2))
                : PointI32.create(Math.max(a1, b2), Math.min(a2, b1));
        }

        return b1 < b2 ? PointI32.create(Math.max(a2, b1), Math.min(a1, b2)) : PointI32.create(Math.max(a2, b2), Math.min(a1, b1));
    } 
}
