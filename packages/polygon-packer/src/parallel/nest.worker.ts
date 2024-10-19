import type { ThreadData, CalculateConfig } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function calculate(config: CalculateConfig, data: ThreadData): ArrayBuffer;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

const config: CalculateConfig = { isInit: false, pointPool: null };

self.onmessage = (event: MessageEvent<ThreadData>) => {
    const buffer = geometryUtils.calculate(config, event.data);

    //@ts-ignore
    self.postMessage(buffer, [buffer]);
};
