import { IThread, ThreadTarget } from './types';

export default class SharedWorkerWrapper implements IThread {
    #worker: SharedWorker;

    public constructor() {
        this.#worker = new SharedWorker(new URL('./nest.worker', import.meta.url), { type: 'module' });
    }

    public trigger(
        data: Record<string, unknown> | ArrayBuffer,
        onMessage: (message: MessageEvent) => void,
        onError: (error: ErrorEvent) => void
    ): void {
        this.#worker.port.onmessage = onMessage;
        this.#worker.onerror = onError;
        if (data instanceof ArrayBuffer) {
            this.#worker.port.postMessage(data, [data]);
        } else {
            this.#worker.port.postMessage(data);
        }
    }

    public getInstance(target: ThreadTarget): boolean {
        return this.#worker.port === target;
    }

    public terminate(): void {
        this.#worker.port.close();
    }

    public clone(): SharedWorkerWrapper {
        return new SharedWorkerWrapper();
    }
}
