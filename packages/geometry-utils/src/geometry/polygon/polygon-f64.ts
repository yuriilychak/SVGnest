import { PointF64 } from '../point';
import { BoundRectF64 } from '../bound-rect';
import PolygonBase from './polygon-base';

export default class PolygonF64 extends PolygonBase<Float64Array> {
    private constructor() {
        super(PointF64.create(), new BoundRectF64());
    }

    public static create(): PolygonF64 {
        return new PolygonF64();
    }

    public static fromMemSeg(memSeg: Float64Array): PolygonF64 {
        const result = new PolygonF64();

        result.bind(memSeg);

        return result;
    }
}
