import { IPolygon, PlacementWorkerData } from '../../../types';
import { Options } from '../../types';
import { placePaths } from './helpers';

const ctx: Worker = self as unknown as Worker;
// eslint-disable-next-line
function alert(message: string) {
    console.log('alert: ', message);
}

function onMessage(this: Worker, code: MessageEvent<Options<PlacementWorkerData>>) {
    function onInnerMessage(this: Worker, e: MessageEvent<IPolygon[]>) {
        this.postMessage(placePaths(e.data, code.data.env));
    }

    this.onmessage = onInnerMessage;
}

ctx.onmessage = onMessage;
