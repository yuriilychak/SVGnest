﻿import WORKERS from './workers';
import Operation from './opertaion';
import { OperationCallback, Options } from './types';
import { WORKER_TYPE } from '../types';

export default class Parallel {
    #data: object[];
    #options: Options;
    #maxWorkers: number;
    #operation: Operation;
    #onSpawn: () => void;

    constructor(id: WORKER_TYPE, data: object[], env: object, onSpawn: () => void = null) {
        this.#data = data;
        this.#maxWorkers = navigator.hardwareConcurrency || 4;
        this.#options = { id, env };
        this.#operation = new Operation(this.#data);
        this.#onSpawn = onSpawn;
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

    private spawnWorker(inputWorker?: Worker): Worker {
        let worker: Worker = inputWorker;

        if (!worker) {
            try {
                const WorkerInstance: typeof Worker = WORKERS.get(this.#options.id);

                worker = new WorkerInstance('');
                worker.postMessage(this.#options);
            } catch (e) {
                console.error(e);
            }
        }

        return worker;
    }

    private triggerWorker(
        worker: Worker,
        data: object,
        onMessage: (message: MessageEvent) => void,
        onError: (error: ErrorEvent) => void
    ): void {
        if (!worker) {
            return;
        }

        worker.onmessage = onMessage;
        worker.onerror = onError;
        worker.postMessage(data);
    }

    private spawnMapWorker(i: number, done: (error: Error | ErrorEvent, worker: Worker) => void, worker?: Worker): void {
        if (this.#onSpawn !== null) {
            this.#onSpawn();
        }

        const resultWorker: Worker = this.spawnWorker(worker);
        const onMessage = (message: MessageEvent<object>) => {
            this.#data[i] = message.data;
            done(null, resultWorker);
        };
        const onError = (error: ErrorEvent) => {
            resultWorker.terminate();
            done(error, null);
        };

        this.triggerWorker(resultWorker, this.#data[i], onMessage, onError);
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
                    worker.terminate();
                    this.#data = message.data;
                    operation.resolve(this.#data);
                };
                const onError = (error: ErrorEvent) => {
                    worker.terminate();
                    operation.reject(error);
                };

                this.triggerWorker(worker, this.#data, onMessage, onError);
            };
        }

        let startedOps: number = 0;
        let doneOps: number = 0;

        const done = (error: Error, worker: Worker): void => {
            if (error) {
                operation.reject(error);
            } else if (++doneOps === this.#data.length) {
                operation.resolve(this.#data);
                if (worker) {
                    worker.terminate();
                }
            } else if (startedOps < this.#data.length) {
                this.spawnMapWorker(startedOps++, done, worker);
            } else if (worker) {
                worker.terminate();
            }
        };

        return () => {
            for (; startedOps - doneOps < this.#maxWorkers && startedOps < this.#data.length; ++startedOps) {
                this.spawnMapWorker(startedOps, done);
            }
        };
    }
}
