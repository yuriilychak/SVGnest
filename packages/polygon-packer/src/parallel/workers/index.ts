import { WORKER_TYPE } from '../../types';
import { PlaceWorker } from './place-worker';
import { PairWorker } from './pair-worker';

const WORKERS = new Map<WORKER_TYPE, typeof Worker>([
    [WORKER_TYPE.PAIR, PairWorker],
    [WORKER_TYPE.PLACEMENT, PlaceWorker]
]);

export default WORKERS;
