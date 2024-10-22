import Polygon from '../polygon';
import PointPool from '../point-pool';
import { THREAD_TYPE } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';
import { WorkerConfig } from './types';

export default function calculate(config: WorkerConfig, buffer: ArrayBuffer): ArrayBuffer {
    if (!config.isInit) {
        config.buffer = new ArrayBuffer(8192 * Float64Array.BYTES_PER_ELEMENT);
        config.pointPool = new PointPool(config.buffer);
        config.memSeg = new Float64Array(config.buffer, config.pointPool.size);
        config.isInit = true;
        config.polygons = [Polygon.create(), Polygon.create(), Polygon.create(), Polygon.create(), Polygon.create()];
    }

    const polygonCount: number = config.polygons.length;
    const view: DataView = new DataView(buffer);
    const dataType: THREAD_TYPE = view.getFloat64(0) as THREAD_TYPE;
    const result: Float64Array = dataType === THREAD_TYPE.PAIR ? pairData(buffer, config) : placePaths(buffer, config);

    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        config.polygons[i].clean();
    }

    return result.buffer;
}
