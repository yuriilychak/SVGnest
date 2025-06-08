import { PointF32 } from '../point';
import { BoundRectF32 } from '../bound-rect';
import PolygonBase from './polygon-base';

export default class PolygonF32 extends PolygonBase<Float32Array> {
    constructor() {
        super(PointF32.create(), new BoundRectF32());
    }
}
