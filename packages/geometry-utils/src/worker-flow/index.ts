import PointPool from '../point-pool';
import { THREAD_TYPE } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';
import { WorkerConfig } from './types';
import PairContent from './pair-content';
import PlaceContent from './place-content';
import PolygonF32 from '../polygon-f32';
import PointPoolF32 from '../point-pool-f32';

export default function calculate(config: WorkerConfig, buffer: ArrayBuffer): ArrayBuffer {
    if (!config.isInit) {
        config.buffer = new ArrayBuffer(8192 * Float64Array.BYTES_PER_ELEMENT);
        config.bufferF32 = new ArrayBuffer(8192 * Float32Array.BYTES_PER_ELEMENT);
        config.pointPoolF32 = new PointPoolF32(config.bufferF32);
        config.memSegF32 = new Float32Array(config.bufferF32, config.pointPoolF32.size);
        config.pointPool = new PointPool(config.buffer);
        config.memSeg = new Float64Array(config.buffer, config.pointPool.size);
        config.isInit = true;
        config.polygonsF32 = [PolygonF32.create(), PolygonF32.create(), PolygonF32.create(), PolygonF32.create(), PolygonF32.create()];
        config.pairContent = new PairContent();
        config.placeContent = new PlaceContent();
    }

    const polygonCount: number = config.polygonsF32.length;
    const view: DataView = new DataView(buffer);
    const dataType: THREAD_TYPE = view.getUint32(0) as THREAD_TYPE;
    const isPair: boolean = dataType === THREAD_TYPE.PAIR;
    const result: ArrayBuffer = isPair ? pairData(buffer, config) : placePaths(buffer, config);

    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        config.polygonsF32[i].clean();
    }
    
    if (isPair) {
        config.pairContent.clean();
    } else {
        config.placeContent.clean();
    }

    return result;
}
