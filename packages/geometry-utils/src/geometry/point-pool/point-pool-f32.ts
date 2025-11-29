import { PointF32 } from '../point';
import PointPoolBase from './point-pool-base';

export default class PointPoolF32 extends PointPoolBase<Float32Array> {
    constructor(buffer: ArrayBuffer = new ArrayBuffer(2 * PointPoolF32.POOL_SIZE * Float32Array.BYTES_PER_ELEMENT), offset: number = 0) {
        const items = new Array<PointF32>(PointPoolF32.POOL_SIZE);
        const memSeg: Float32Array = new Float32Array(buffer, offset, PointPoolF32.POOL_SIZE << 1);

        memSeg.fill(0);

        for (let i = 0; i < PointPoolF32.POOL_SIZE; ++i) {
            items[i] = new PointF32(memSeg, i << 1);
        }

        super(memSeg, items);
    }
}
