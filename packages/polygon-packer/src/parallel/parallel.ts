import Operation from './opertaion';
import { OperationCallback } from './types';
import { WORKER_TYPE } from '../types';
import WorkerPool from './worker-pool';

export default class Parallel {
    #data: object[];
    #operation: Operation;
    #onSpawn: () => void;
    #pool: WorkerPool;

    constructor(id: WORKER_TYPE, data: object[], env: object, onSpawn: () => void = null) {
        this.#data = data;
        this.#operation = new Operation(this.#data);
        this.#onSpawn = onSpawn;
        this.#pool = new WorkerPool(id, env);
    }

    public then<T>(successCallback: (result: T[]) => void, errorCallback: (error: Error[]) => void = () => {}): void {
        const dataOperation: Operation = new Operation();
        const chainOperation: Operation = new Operation();

        this.triggerOperation(dataOperation, this.getDataResolveCallback(dataOperation), (error: Error) =>
            dataOperation.reject(error)
        );

        this.triggerOperation(
            chainOperation,
            () => {
                try {
                    this.processResult<T>(successCallback, chainOperation, this.#data as T[]);
                } catch (error) {
                    this.processResult<Error>(errorCallback, chainOperation, [error] as Error[]);
                }
            },
            (error: Error) => this.processResult<Error>(errorCallback, chainOperation, [error])
        );
    }

    public terminate(): void {
        this.#pool.terminateAll();
    }

    private spawnWorker(inputId: number = -1): number {
        let resultId: number = inputId;

        if (resultId === -1) {
            try {
                resultId = this.#pool.spawn();
            } catch (e) {
                console.error(e);
            }
        }

        return resultId;
    }

    private spawnMapWorker(i: number, done: (error: Error | ErrorEvent, worker: number) => void, worker: number = -1): void {
        if (this.#onSpawn !== null) {
            this.#onSpawn();
        }

        const resultWorker: number = this.spawnWorker(worker);
        const onMessage = (message: MessageEvent<object>) => {
            this.#data[i] = message.data;
            done(null, resultWorker);
        };
        const onError = (error: ErrorEvent) => {
            this.#pool.terminate(resultWorker);
            done(error, null);
        };

        this.#pool.trigger(resultWorker, onMessage, onError, this.#data[i]);
    }

    private triggerOperation(operation: Operation, resolve: OperationCallback, reject: OperationCallback): void {
        this.#operation.then(resolve, reject);
        this.#operation = operation;
    }

    private processResult<T>(onResult: (data: T[]) => void, operation: Operation, data: T[]): void {
        if (onResult) {
            onResult(data);

            operation.resolve(this.#data);
        } else {
            operation.resolve(data);
        }
    }

    private getDataResolveCallback(operation: Operation): OperationCallback {
        if (!this.#data.length) {
            return () => {
                const worker = this.spawnWorker();
                const onMessage = (message: MessageEvent<object[]>) => {
                    this.#pool.terminate(worker);
                    this.#data = message.data;
                    operation.resolve(this.#data);
                };
                const onError = (error: ErrorEvent) => {
                    this.#pool.terminate(worker);
                    operation.reject(error);
                };

                this.#pool.trigger(worker, onMessage, onError, this.#data);
            };
        }

        let startedOps: number = 0;
        let doneOps: number = 0;

        const done = (error: Error, worker: number): void => {
            if (error) {
                operation.reject(error);
            } else if (++doneOps === this.#data.length) {
                operation.resolve(this.#data);
                if (worker !== -1) {
                    this.#pool.terminate(worker);
                }
            } else if (startedOps < this.#data.length) {
                this.spawnMapWorker(startedOps++, done, worker);
            } else if (worker !== -1) {
                this.#pool.terminate(worker);
            }
        };

        return () => {
            for (; startedOps - doneOps < this.#pool.workerCount && startedOps < this.#data.length; ++startedOps) {
                this.spawnMapWorker(startedOps, done);
            }
        };
    }
}
