import { THREAD_TYPE } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';
import { WorkerConfig } from './types';
import PlaceContent from './place-content';
import { PolygonF64, PolygonF32, PointPoolF64, PointPoolF32 } from '../geometry';
import { WORKER_CONFIG_POLY_COUNT } from './ constants';

export default function calculate(config: WorkerConfig, buffer: ArrayBuffer): ArrayBuffer {
    if (!config.isInit) {
        config.buffer = new ArrayBuffer(8192 * Float64Array.BYTES_PER_ELEMENT);
        config.isInit = true;
        config.placeContent = new PlaceContent();

        const pool32 = new PointPoolF32(config.buffer);
        const pool64 = new PointPoolF64(config.buffer);

        config.f32 = {
            pointPool: pool32,
            memSeg: new Float32Array(config.buffer, pool32.size),
            polygons: new Array(WORKER_CONFIG_POLY_COUNT).fill(null).map(() => new PolygonF32())
        }

        config.f64 = {
            pointPool: pool64,
            memSeg: new Float64Array(config.buffer, pool64.size),
            polygons: new Array(WORKER_CONFIG_POLY_COUNT).fill(null).map(() => new PolygonF64())
        };
    }

    const view: DataView = new DataView(buffer);
    const dataType: THREAD_TYPE = view.getUint32(0) as THREAD_TYPE;
    const isPair: boolean = dataType === THREAD_TYPE.PAIR;
    const result: ArrayBuffer = isPair ? pairData(buffer) : placePaths(buffer, config);

    let i: number = 0;

    for (i = 0; i < WORKER_CONFIG_POLY_COUNT; ++i) {
        config.f32.polygons[i].clean();
        config.f64.polygons[i].clean();
    }
    
    if (!isPair) {
        config.placeContent.clean();
    }

    return result;
}
