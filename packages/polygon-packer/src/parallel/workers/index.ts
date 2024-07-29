import { WORKER_TYPE } from '../../types';
// @ts-expect-error import worker
import PlaceWorker from './place.worker';
// @ts-expect-error import worker
import PairWorker from './pair.worker';

const WORKERS = new Map<WORKER_TYPE, typeof Worker>([
    [WORKER_TYPE.PAIR, PairWorker],
    [WORKER_TYPE.PLACEMENT, PlaceWorker]
]);

export default WORKERS;
