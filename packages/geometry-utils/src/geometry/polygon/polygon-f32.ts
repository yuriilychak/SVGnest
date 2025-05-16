import { PointF32 } from '../point';
import { BoundRectF32 } from '../bound-rect';
import PolygonBase from './polygon-base';

export default class PolygonF32 extends PolygonBase<Float32Array> {
    private constructor() {
        super(PointF32.create(), new BoundRectF32());
    }

    public static create(): PolygonF32 {
        return new PolygonF32();
    }

    public static fromMemSeg(memSeg: Float32Array): PolygonF32 {
        const result = new PolygonF32();

        result.bind(memSeg);

        return result;
    }
}
