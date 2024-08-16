import { IWorker } from './types';

export default class SharedWorkerWrapper implements IWorker {
    #worker: SharedWorker;

    public constructor() {
        this.#worker = new SharedWorker(new URL('./nest.sharedWorker', import.meta.url), { type: 'module' });
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

    public terminate(): void {
        this.#worker.port.close();
    }

    public clone(): SharedWorkerWrapper {
        return new SharedWorkerWrapper();
    }
}
