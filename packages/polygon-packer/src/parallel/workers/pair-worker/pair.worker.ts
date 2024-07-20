import { NestConfig, NFPPair } from '../../../types';
import { pairData } from './helpers';

const ctx: Worker = self as unknown as Worker;

function onMessage(this: Worker, code: MessageEvent<NestConfig>) {
    function onInnerMessage(this: Worker, e: MessageEvent<NFPPair>) {
        this.postMessage(pairData(e.data, code.data));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
