import type { PolygonNode, NestConfig, NFPPair, ThreadData } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export class PointPool {}
    export function placePaths(paths: PolygonNode[], config: NestConfig, pointPool: PointPool): Float64Array;
    export function pairData(paths: NFPPair, config: NestConfig, pointPool: PointPool): Float64Array;
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

        const result: Float64Array =
            id === 'pair' ? pairData(data as NFPPair, env, pointPool) : placePaths(data as PolygonNode[], env, pointPool);
        const buffer = result.buffer;

        instance.postMessage(buffer, [buffer]);
    };
}

//@ts-ignore
if (typeof self.SharedWorkerGlobalScope !== 'undefined') {
    self.addEventListener('connect', (event: MessageEvent) => applyWorkerFlow(event.ports[0]));
} else {
    applyWorkerFlow(self as unknown as Worker);
}
