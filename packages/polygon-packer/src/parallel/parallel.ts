export default class Parallel {
    #threadsUsage: boolean[];

    #threadCount: number;

    #threads: Worker[];

    #input: ArrayBuffer[] = null;

    #output: ArrayBuffer[] = null;

    #threadIndices: number[];

    #isTerminated: boolean = true;

    #iterationCount: number = 0;

    #startedThreads: number = 0;

    #totalThreads: number = 0;

    #onError: (error: ErrorEvent) => void = null;

    #onSuccess: (result: ArrayBuffer[]) => void = null;

    #onSpawn: (count: number) => void = null;

    constructor() {
        this.#threadCount = navigator.hardwareConcurrency || 4;
        this.#threadsUsage = new Array(this.#threadCount);
        this.#threads = new Array(this.#threadCount);
        this.#threadIndices = new Array(this.#threadCount);

        this.#threadsUsage.fill(false);
        this.#threads.fill(null);
        this.#threadIndices.fill(-1);
    }

    public start(
        input: ArrayBuffer[],
        onSuccess: (result: ArrayBuffer[]) => void,
        onError: (error: ErrorEvent) => void,
        onSpawn: (scount: number) => void = null
    ): boolean {
        if (input.length === 0) {
            this.onError(new ErrorEvent('Empty data'));
            return false;
        }

        this.#onError = onError;
        this.#onSuccess = onSuccess;
        this.#onSpawn = onSpawn;
        this.#iterationCount = 0;
        this.#startedThreads = 0;
        this.#input = input;
        this.#totalThreads = input.length;
        this.#output = new Array(this.#totalThreads);
        let i: number = 0;

        this.#threadsUsage.fill(false);
        this.#threadIndices.fill(-1);

        if (this.#isTerminated) {
            for (i = 0; i < this.#threadCount; ++i) {
                this.#threads[i] = new Worker(new URL('./nest.worker', import.meta.url), { type: 'module' });
            }

            this.#isTerminated = false;
        }

        while (this.#startedThreads < this.#totalThreads && this.#threadsUsage.indexOf(false) !== -1) {
            this.trigger();
        }

        return true;
    }

    public terminate(): void {
        let i: number = 0;

        for (i = 0; i < this.#threadCount; ++i) {
            if (this.#threads[i] !== null) {
                this.#threads[i].terminate();
                this.#threads[i] = null;
            }
            this.#threadsUsage[i] = false;
            this.#threadIndices[i] = -1;
        }

        this.#isTerminated = true;
    }

    private trigger(): boolean {
        const index: number = this.#threadsUsage.indexOf(false);

        if (index === -1) {
            return false;
        }

        this.#threadsUsage[index] = true;

        const thread = this.#threads[index];
        const threadIndex: number = this.#startedThreads;

        ++this.#startedThreads;

        this.#threadIndices[index] = threadIndex;

        if (this.#onSpawn !== null) {
            this.#onSpawn(this.#startedThreads);
        }

        const input = this.#input[threadIndex];

        thread.onmessage = this.onMessage;
        thread.onerror = this.onError;
        thread.postMessage(input, [input]);

        return true;
    }

    private onMessage = (message: MessageEvent<ArrayBuffer>) => {
        const index = this.clean(message.currentTarget as Worker);
        const threadIndex = this.#threadIndices[index];

        this.#output[threadIndex] = message.data;

        if (this.#iterationCount === this.#totalThreads) {
            this.#onSuccess(this.#output);
            return;
        }

        if (this.#startedThreads < this.#totalThreads) {
            this.trigger();
        }
    };

    private onError = (error: ErrorEvent) => {
        this.clean(error.currentTarget as Worker);
        this.#onError(error);
    };

    private clean(target: Worker): number {
        let i: number = 0;

        for (i = 0; i < this.#threadCount; ++i) {
            if (this.#threads[i] === target) {
                break;
            }
        }

        this.#threadsUsage[i] = false;
        ++this.#iterationCount;

        return i;
    }
}
