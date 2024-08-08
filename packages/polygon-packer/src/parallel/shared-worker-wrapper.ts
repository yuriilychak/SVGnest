import { IWorker } from './types';

export default class SharedWorkerWrapper implements IWorker {
    #worker: SharedWorker;

    public constructor() {
        this.#worker = new SharedWorker(new URL('./nest.sharedWorker', import.meta.url), { type: 'module' });
    }

    public init(onMessage: (message: MessageEvent) => void, onError: (error: ErrorEvent) => void): void {
        this.#worker.port.onmessage = onMessage;
        this.#worker.onerror = onError;
    }

    public post(data: Record<string, unknown>): void {
        this.#worker.port.postMessage(data);
    }

    public terminate(): void {
        this.#worker.port.close();
    }
}
