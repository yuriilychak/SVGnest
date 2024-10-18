import type { ThreadData, CalculateConfig } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function calculate(config: CalculateConfig, data: ThreadData): ArrayBuffer;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

function applyWorkerFlow(instance: MessagePort | Worker) {
    const config: CalculateConfig = { isInit: false, pointPool: null };

    instance.onmessage = (event: MessageEvent<ThreadData>) => {
        const buffer = geometryUtils.calculate(config, event.data);

        instance.postMessage(buffer, [buffer]);
    };
}

//@ts-ignore
if (typeof self.SharedWorkerGlobalScope !== 'undefined') {
    self.addEventListener('connect', (event: MessageEvent) => applyWorkerFlow(event.ports[0]));
} else {
    applyWorkerFlow(self as unknown as Worker);
}
