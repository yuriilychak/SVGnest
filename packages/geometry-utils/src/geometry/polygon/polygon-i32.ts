import { BoundRectI32 } from '../bound-rect';
import { PointI32 } from '../point';
import PolygonBase from './polygon-base';

export default class PolygonI32 extends PolygonBase<Int32Array> {
    private constructor() {
        super(PointI32.create(), new BoundRectI32());
    }

    public static create(): PolygonI32 {
        return new PolygonI32();
    }

    public static fromMemSeg(memSeg: Int32Array): PolygonI32 {
        const result = new PolygonI32();

        result.bind(memSeg);

        return result;
    }
}
