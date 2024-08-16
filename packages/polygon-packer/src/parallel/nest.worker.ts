import type { IPolygon, NestConfig, NFPPair, PairWorkerResult, PlacementWorkerResult } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function placePaths(paths: IPolygon[], config: NestConfig): PlacementWorkerResult | null;
    export function pairData(paths: NFPPair, config: NestConfig): PairWorkerResult | null;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

self.onmessage = (event: MessageEvent<{ env: NestConfig; id: string; data: IPolygon[] | NFPPair }>) => {
    const { data, env, id } = event.data;
    const { pairData, placePaths } = geometryUtils;
    const result = id === 'pair' ? pairData(data as NFPPair, env) : placePaths(data as IPolygon[], env);

    self.postMessage(result);
};
