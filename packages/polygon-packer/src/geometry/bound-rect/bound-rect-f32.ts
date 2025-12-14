import { PointF32 } from '../point';
import BoundRectBase from './bound-rect-base';

export default class BoundRectF32 extends BoundRectBase<Float32Array> {
    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        const memSeg = new Float32Array([x, y, width, height]);
        const position = new PointF32(memSeg, 0);
        const size = new PointF32(memSeg, 2);

        super(memSeg, position, size);
    }

    public clone(): BoundRectF32 {
        return new BoundRectF32(this.x, this.y, this.width, this.height);
    }
}
