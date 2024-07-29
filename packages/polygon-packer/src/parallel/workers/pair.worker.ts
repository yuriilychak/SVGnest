import type { NestConfig, NFPPair, PairWorkerResult } from '../../types';

// Use importScripts to load the external script
declare function importScripts(...urls: string[]): void;

declare module geometryUtils {
    export function pairData(paths: NFPPair, config: NestConfig): PairWorkerResult | null;
}

importScripts(self.location.href.replace('pair.worker', 'geometry-utils'));

const ctx: Worker = self as unknown as Worker;

function onMessage(this: Worker, code: MessageEvent<{ env: NestConfig }>) {
    function onInnerMessage(this: Worker, e: MessageEvent<NFPPair>) {
        this.postMessage(geometryUtils.pairData(e.data, code.data.env));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
