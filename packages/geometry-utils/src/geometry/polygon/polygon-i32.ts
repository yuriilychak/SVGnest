import { BoundRectI32 } from '../bound-rect';
import { PointI32 } from '../point';
import PolygonBase from './polygon-base';

export default class PolygonI32 extends PolygonBase<Int32Array> {
    constructor() {
        super(PointI32.create(), new BoundRectI32());
    }
}
