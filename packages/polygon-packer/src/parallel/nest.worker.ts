import type { IPolygon, NestConfig, NFPPair, PairWorkerResult, PlacementWorkerResult, ThreadData } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function placePaths(paths: IPolygon[], config: NestConfig): PlacementWorkerResult | null;
    export function pairData(paths: NFPPair, config: NestConfig): PairWorkerResult | null;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

function applyWorkerFlow(instance: MessagePort | Worker) {
    instance.onmessage = (event: MessageEvent<ThreadData>) => {
        const { data, env, id } = event.data;
        const { pairData, placePaths } = geometryUtils;
        const result = id === 'pair' ? pairData(data as NFPPair, env) : placePaths(data as IPolygon[], env);

        instance.postMessage(result);
    };
}

//@ts-ignore
applyWorkerFlow(self as unknown as Worker);

