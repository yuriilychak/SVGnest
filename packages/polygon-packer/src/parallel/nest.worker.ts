import type { IPolygon, NestConfig, NFPPair, PairWorkerResult, PlacementWorkerResult, ThreadData } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export class PointPool {}
    export function placePaths(paths: IPolygon[], config: NestConfig, pointPool: PointPool): PlacementWorkerResult | null;
    export function pairData(paths: NFPPair, config: NestConfig, pointPool: PointPool): PairWorkerResult | null;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

function applyWorkerFlow(instance: MessagePort | Worker) {
    let pointPool: geometryUtils.PointPool = null;

    instance.onmessage = (event: MessageEvent<ThreadData>) => {
        const { data, env, id } = event.data;
        const { pairData, placePaths, PointPool } = geometryUtils;

        if (pointPool === null) {
            pointPool = new PointPool();
        }

        const result =
            id === 'pair' ? pairData(data as NFPPair, env, pointPool) : placePaths(data as IPolygon[], env, pointPool);

        instance.postMessage(result);
    };
}

//@ts-ignore
if (typeof self.SharedWorkerGlobalScope !== 'undefined') {
    self.addEventListener('connect', (event: MessageEvent) => applyWorkerFlow(event.ports[0]));
} else {
    applyWorkerFlow(self as unknown as Worker);
}
