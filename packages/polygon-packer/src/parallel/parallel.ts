import Operation from './opertaion';
import { WORKER_TYPE } from '../types';
import WorkerPool from './worker-pool';

export default class Parallel {
    #data: unknown[] = null;
    #pool: WorkerPool = new WorkerPool();

    public start(
        id: WORKER_TYPE,
        data: unknown[],
        env: object,
        successCallback: (result: unknown[]) => void,
        errorCallback: (error: Error) => void,
        onSpawn: () => void = null
    ): void {
        this.#data = data;
        this.#pool.update(id, env);
        const dataOperation: Operation = new Operation();
        const chainOperation: Operation = new Operation();

        if (data.length === 0) {
            const worker = this.#pool.spawn();
            const onMessage = (message: MessageEvent<object[]>) => {
                this.#pool.clean(worker);
                this.#data = message.data;
                dataOperation.resolve(data);
            };
            const onError = (error: ErrorEvent) => {
                this.#pool.clean(worker);
                dataOperation.reject(error);
            };

            this.#pool.trigger(worker, onMessage, onError, data);
        } else {
            let startedOps: number = 0;
            let doneOps: number = 0;

            const done = (error: Error, worker: number): void => {
                if (error) {
                    dataOperation.reject(error);
                } else if (++doneOps === data.length) {
                    if (worker !== -1) {
                        this.#pool.clean(worker);
                    }
                    dataOperation.resolve(data);
                } else if (startedOps < data.length) {
                    this.spawnMapWorker(startedOps++, done, worker, onSpawn);
                } else if (worker !== -1) {
                    this.#pool.clean(worker);
                }
            };

            for (; startedOps - doneOps < this.#pool.workerCount && startedOps < data.length; ++startedOps) {
                this.spawnMapWorker(startedOps, done, -1, onSpawn);
            }
        }

        dataOperation.then(
            () => chainOperation.processResult(successCallback, errorCallback, this.#data),
            (error: Error) => chainOperation.processResult(successCallback, errorCallback, this.#data, error)
        );
    }

    public terminate(): void {
        this.#pool.terminateAll();
    }

    private spawnMapWorker(
        i: number,
        done: (error: Error | ErrorEvent, worker: number) => void,
        inputWorkerId: number,
        onSpawn: () => void = null
    ): void {
        if (onSpawn !== null) {
            onSpawn();
        }

        const workerId: number = this.#pool.spawn(inputWorkerId);

        const onMessage = (message: MessageEvent<object>) => {
            this.#data[i] = message.data;
            done(null, workerId);
        };
        const onError = (error: ErrorEvent) => {
            this.#pool.clean(workerId);
            done(error, null);
        };

        this.#pool.trigger(workerId, onMessage, onError, this.#data[i]);
    }
}
