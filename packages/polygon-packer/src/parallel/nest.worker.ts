import type { CalculateConfig } from '../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function calculate(config: CalculateConfig, data: ArrayBuffer): ArrayBuffer;
}

importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1wasm-nesting`));
importScripts(self.location.href.replace(/^(.*\/)[^\/]+(?=\.js$)/, `$1geometry-utils`));

const config: CalculateConfig = { isInit: false, pointPool: null };

let isWasmInitialized = false;

const trigger = (event: MessageEvent<ArrayBuffer>) => {
    if (isWasmInitialized) {
        const buffer = geometryUtils.calculate(config, event.data);

        //@ts-ignore
        self.postMessage(buffer, [buffer]);
    } else {
        const handler = () => {
            self.removeEventListener('wasmReady', handler);
            isWasmInitialized = true;
            trigger(event);
        }
        self.addEventListener('wasmReady', handler)
    }
}

self.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    trigger(event);
};
