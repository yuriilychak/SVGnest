import { IWorker, WorkerTarget } from './types';

export default class SharedWorkerWrapper implements IWorker {
    #worker: SharedWorker;

    public constructor() {
        this.#worker = new SharedWorker(new URL('./nest.worker', import.meta.url), { type: 'module' });
    }

    public trigger(
        data: Record<string, unknown>,
        onMessage: (message: MessageEvent) => void,
        onError: (error: ErrorEvent) => void
    ): void {
        this.#worker.port.onmessage = onMessage;
        this.#worker.onerror = onError;
        this.#worker.port.postMessage(data);
    }

    public getInstance(target: WorkerTarget): boolean {
        return this.#worker.port === target;
    }

    public terminate(): void {
        this.#worker.port.close();
    }

    public clone(): SharedWorkerWrapper {
        return new SharedWorkerWrapper();
    }
}
