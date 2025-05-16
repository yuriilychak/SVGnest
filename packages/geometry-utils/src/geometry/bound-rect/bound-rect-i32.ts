import { PointI32 } from '../point';
import BoundRectBase from './bound-rect-base';

export default class BoundRectI32 extends BoundRectBase<Int32Array> {
    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        const memSeg = new Int32Array([x, y, width, height]);
        const position = new PointI32(memSeg, 0);
        const size = new PointI32(memSeg, 2);

        super(memSeg, position, size);
    }

    public clone(): BoundRectI32 {
        return new BoundRectI32(this.x, this.y, this.width, this.height);
    }
}
