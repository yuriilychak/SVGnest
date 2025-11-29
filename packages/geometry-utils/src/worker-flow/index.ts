import { THREAD_TYPE } from '../types';
import { pairData } from './pair-flow';
import { placePaths } from './place-flow';

export default function calculate(buffer: ArrayBuffer): ArrayBuffer {
    const view: DataView = new DataView(buffer);
    const dataType: THREAD_TYPE = view.getUint32(0) as THREAD_TYPE;
    const isPair: boolean = dataType === THREAD_TYPE.PAIR;
    const result: ArrayBuffer = isPair ? pairData(buffer) : placePaths(buffer);

    return result;
}
