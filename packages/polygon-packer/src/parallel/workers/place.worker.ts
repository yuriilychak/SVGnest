import { Options } from '../types';
import { placePaths } from './shared';

// clipperjs uses alerts for warnings
function alert(message: string) {
    console.log('alert: ', message);
}

const ctx: Worker = self as unknown as Worker;

function onMessage(code: MessageEvent<Options>) {
    function onInnerMessage(e: MessageEvent<Options>) {
        this.postMessage(placePaths(e.data, code.data.env));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
