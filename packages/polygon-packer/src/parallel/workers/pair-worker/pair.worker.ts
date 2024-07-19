import { Options } from '../../types';
import { pairData } from './shared';

const ctx: Worker = self as unknown as Worker;

function onMessage(this: Worker, code: MessageEvent<Options>) {
    function onInnerMessage(this: Worker, e: MessageEvent<Options>) {
        this.postMessage(pairData(e.data, code.data.env));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
