import { IWorker } from './types';

export default class DedicatedWorkerWrapper implements IWorker {
    #worker: Worker;

    public constructor() {
        this.#worker = new Worker(new URL('./nest.worker', import.meta.url), { type: 'module' });
    }

    public init(onMessage: (message: MessageEvent) => void, onError: (error: ErrorEvent) => void): void {
        this.#worker.onmessage = onMessage;
        this.#worker.onerror = onError;
    }

    public post(data: Record<string, unknown>): void {
        this.#worker.postMessage(data);
    }

    public terminate(): void {
        this.#worker.terminate();
    }
}
