import { PointF64 } from '../point';
import BoundRectBase from './bound-rect-base';


export default class BoundRectF64 extends BoundRectBase<Float64Array> {
    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        const memSeg = new Float64Array([x, y, width, height]);
        const position = new PointF64(memSeg, 0);
        const size = new PointF64(memSeg, 2);

        super(memSeg, position, size);
    }

    public clone(): BoundRectF64 {
        return new BoundRectF64(this.x, this.y, this.width, this.height);
    }
}