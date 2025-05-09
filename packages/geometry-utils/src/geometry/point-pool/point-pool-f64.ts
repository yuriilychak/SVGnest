import { PointF64 } from '../point';
import PointPoolBase from './point-pool-base';
export default class PointPoolF64 extends PointPoolBase<Float64Array> {

    constructor(buffer: ArrayBuffer, offset: number = 0) {
        const items = new Array<PointF64>(PointPoolF64.POOL_SIZE);
        const memSeg: Float64Array = new Float64Array(buffer, offset, PointPoolF64.POOL_SIZE << 1);
        
        memSeg.fill(0);
        
        for (let i = 0; i < PointPoolF64.POOL_SIZE; ++i) {
            items[i] = new PointF64(memSeg, i << 1);
        }
        
        super(memSeg, items);
    }
}
