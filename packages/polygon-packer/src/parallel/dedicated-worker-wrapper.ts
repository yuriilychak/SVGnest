import { IThread, ThreadTarget } from './types';

export default class DedicatedWorkerWrapper implements IThread {
    #worker: Worker;

    public constructor() {
        this.#worker = new Worker(new URL('./nest.worker', import.meta.url), { type: 'module' });
    }

    public trigger(
        data: Record<string, unknown>,
        onMessage: (message: MessageEvent) => void,
        onError: (error: ErrorEvent) => void
    ): void {
        this.#worker.onmessage = onMessage;
        this.#worker.onerror = onError;
        this.#worker.postMessage(data);
    }

    public getInstance(target: ThreadTarget): boolean {
        return this.#worker === target;
    }

    public terminate(): void {
        this.#worker.terminate();
    }

    public clone(): DedicatedWorkerWrapper {
        return new DedicatedWorkerWrapper();
    }
}
