import { PointF64 } from '../point';
import { BoundRectF64 } from '../bound-rect';
import PolygonBase from './polygon-base';

export default class PolygonF64 extends PolygonBase<Float64Array> {
    constructor() {
        super(PointF64.create(), new BoundRectF64());
    }
}
