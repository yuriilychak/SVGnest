import type { PolygonNode, NestConfig, NFPPair, ThreadData, PlacementWorkerData } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function calculate(
        config: { pointPool: unknown; isInit: boolean },
        id: string,
        data: NFPPair | PolygonNode[],
        env: NestConfig | PlacementWorkerData
    ): ArrayBuffer;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

function applyWorkerFlow(instance: MessagePort | Worker) {
    const config: { pointPool: unknown; isInit: boolean } = {
        isInit: false,
        pointPool: null
    };

    instance.onmessage = (event: MessageEvent<ThreadData>) => {
        const { data, env, id } = event.data;

        const buffer = geometryUtils.calculate(config, id, data, env);

        instance.postMessage(buffer, [buffer]);
    };
}

//@ts-ignore
if (typeof self.SharedWorkerGlobalScope !== 'undefined') {
    self.addEventListener('connect', (event: MessageEvent) => applyWorkerFlow(event.ports[0]));
} else {
    applyWorkerFlow(self as unknown as Worker);
}
