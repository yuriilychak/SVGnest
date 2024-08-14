import { WORKER_TYPE } from '../types';
import DedicatedWorkerWrapper from './dedicated-worker-wrapper';
import SharedWorkerWrapper from './shared-worker-wrapper';
import { IWorker, Options } from './types';

export default class WorkerPool {
    #usedWorkers: boolean[];

    #workerCount: number;

    #workers: IWorker[];

    #options: Options;

    constructor(id: WORKER_TYPE, env: object) {
        const isSharedWorkersSupported = typeof SharedWorker !== 'undefined';
        const instance: IWorker = isSharedWorkersSupported ? new SharedWorkerWrapper() : new DedicatedWorkerWrapper();

        this.#options = { id, env };
        this.#workerCount = navigator.hardwareConcurrency || 4;
        this.#usedWorkers = new Array(this.#workerCount);
        this.#workers = [instance];

        this.#usedWorkers.fill(false);

        let i: number = 0;

        for (i = 1; i < this.#workerCount; ++i) {
            this.#workers.push(instance.clone());
        }
    }

    public spawn(): number {
        const index = this.#usedWorkers.indexOf(false);

        if (index !== -1) {
            this.#usedWorkers[index] = true;
        }

        return index;
    }

    public trigger(
        id: number,
        onMessage: (message: MessageEvent) => void,
        onError: (error: ErrorEvent) => void,
        data: unknown
    ): boolean {
        if (id === -1) {
            return false;
        }

        const worker = this.#workers[id];

        worker.init(onMessage, onError);
        worker.post({ ...this.#options, data });

        return true;
    }

    public terminate(id: number): void {
        const worker = this.#workers[id];

        worker.terminate();
    }

    public terminateAll(): void {
        let i: number = 0;

        for (i = 0; i < this.#workerCount; ++i) {
            this.#workers[i].terminate();
            this.#usedWorkers[i] = false;
        }
    }

    public get isEmpty(): boolean {
        return this.#usedWorkers.indexOf(false) === -1;
    }

    public get workerCount(): number {
        return this.#workerCount;
    }
}
