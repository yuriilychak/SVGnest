import { Options } from '../types';
import { pairData } from './shared';

const ctx: Worker = self as unknown as Worker;

function onMessage(code: MessageEvent<Options>) {
    function onInnerMessage(e: MessageEvent<Options>) {
        this.postMessage(pairData(e.data, code.data.env));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
