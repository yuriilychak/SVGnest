import PointPool from '../point-pool';
import { THREAD_TYPE } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';

export default function calculate(config: { pointPool: PointPool; isInit: boolean }, buffer: ArrayBuffer): ArrayBuffer {
    if (!config.isInit) {
        config.isInit = true;
        config.pointPool = new PointPool();
    }

    const view: DataView = new DataView(buffer);
    const dataType: THREAD_TYPE = view.getFloat64(0) as THREAD_TYPE;
    const result: Float64Array =
        dataType === THREAD_TYPE.PAIR ? pairData(buffer, config.pointPool) : placePaths(buffer, config.pointPool);

    return result.buffer;
}
