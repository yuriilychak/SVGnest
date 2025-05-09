import { PointI32 } from '../point';
import PointPoolBase from './point-pool-base';

export default class PointPoolI32 extends PointPoolBase<Int32Array> {
    constructor(buffer: ArrayBuffer, offset: number = 0) {
        const items = new Array<PointI32>(PointPoolI32.POOL_SIZE);
        const memSeg: Int32Array = new Int32Array(buffer, offset, PointPoolI32.POOL_SIZE << 1);

        memSeg.fill(0);

        for (let i = 0; i < PointPoolI32.POOL_SIZE; ++i) {
            items[i] = new PointI32(memSeg, i << 1);
        }

        super(memSeg, items);
    }
}
