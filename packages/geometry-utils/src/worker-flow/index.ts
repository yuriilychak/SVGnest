import PointPool from '../point-pool';
import { PlacementWorkerData, PolygonNode } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';

export default function calculate(
    config: { pointPool: PointPool; isInit: boolean },
    data:
        | {
              id: string;
              data: PolygonNode[];
              env: PlacementWorkerData;
          }
        | ArrayBuffer
): ArrayBuffer {
    if (!config.isInit) {
        config.isInit = true;
        config.pointPool = new PointPool();
    }

    const result: Float64Array =
        data instanceof ArrayBuffer ? pairData(data, config.pointPool) : placePaths(data.data, data.env, config.pointPool);

    return result.buffer;
}
