import PointPool from '../point-pool';
import { NestConfig, NFPPair, PlacementWorkerData, PolygonNode } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';

export default function calculate(
    config: { pointPool: PointPool; isInit: boolean },
    id: string,
    data: NFPPair | PolygonNode[],
    env: NestConfig | PlacementWorkerData
): ArrayBuffer {
    if (!config.isInit) {
        config.isInit = true;
        config.pointPool = new PointPool();
    }

    const result: Float64Array =
        id === 'pair'
            ? pairData(data as NFPPair, env as NestConfig, config.pointPool)
            : placePaths(data as PolygonNode[], env as PlacementWorkerData, config.pointPool);

    return result.buffer;
}
