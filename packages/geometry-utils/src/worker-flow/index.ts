import Polygon from '../polygon';
import PointPool from '../point-pool';
import { THREAD_TYPE } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';
import { WorkerConfig } from './types';
import PairContent from './pair-content';
import PlaceContent from './place-content';

export default function calculate(config: WorkerConfig, buffer: ArrayBuffer): ArrayBuffer {
    if (!config.isInit) {
        config.buffer = new ArrayBuffer(8192 * Float64Array.BYTES_PER_ELEMENT);
        config.pointPool = new PointPool(config.buffer);
        config.memSeg = new Float64Array(config.buffer, config.pointPool.size);
        config.isInit = true;
        config.polygons = [Polygon.create(), Polygon.create(), Polygon.create(), Polygon.create(), Polygon.create()];
        config.pairContent = new PairContent();
        config.placeContent = new PlaceContent();
    }

    const polygonCount: number = config.polygons.length;
    const view: DataView = new DataView(buffer);
    const dataType: THREAD_TYPE = view.getFloat64(0) as THREAD_TYPE;
    const isPair: boolean = dataType === THREAD_TYPE.PAIR;
    const result: Float64Array = isPair ? pairData(buffer, config) : placePaths(buffer, config);

    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        config.polygons[i].clean();
    }
    
    if (isPair) {
        config.pairContent.clean();
    } else {
        config.placeContent.clean();
    }

    return result.buffer;
}
