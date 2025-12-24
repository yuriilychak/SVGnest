import { Parallel } from './parallel';
import { DisplayCallback, NestConfig } from './types';
import WasmPacker from './wasm-packer';

export default class PolygonPacker {
    #wasmPacker = new WasmPacker();

    #isWorking: boolean = false;

    #progress: number = 0;

    #workerTimer: number = 0;

    #paralele: Parallel = new Parallel();

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public start(
        configuration: NestConfig,
        polygons: Float32Array[],
        binPolygon: Float32Array,
        progressCallback: (progress: number) => void,
        displayCallback: DisplayCallback
    ): void {
        this.#wasmPacker.init(configuration, polygons, binPolygon);
        this.#isWorking = true;

        this.launchWorkers(displayCallback);

        this.#workerTimer = setInterval(() => {
            progressCallback(this.#progress);
        }, 100) as unknown as number;
    }

    private onSpawn = (spawnCount: number): void => {
        this.#progress = spawnCount / this.#wasmPacker.pairCount;
    };

    launchWorkers(displayCallback: DisplayCallback) {
        const pairs = this.#wasmPacker.getPairs();
        this.#paralele.start(
            pairs,
            (generatedNfp: ArrayBuffer[]) => this.onPair(generatedNfp, displayCallback),
            this.onError,
            this.onSpawn
        );
    }

    private onError(error: ErrorEvent) {
        console.log(error);
    }

    private onPair(generatedNfp: ArrayBuffer[], displayCallback: DisplayCallback): void {
        const placements = [this.#wasmPacker.getPlacementData(generatedNfp).buffer];

        this.#paralele.start(
            placements,
            (placements: ArrayBuffer[]) => this.onPlacement(placements, displayCallback),
            this.onError
        );
    }

    private onPlacement(placements: ArrayBuffer[], displayCallback: DisplayCallback): void {
        if (placements.length === 0) {
            return;
        }

        const placementResult = this.#wasmPacker.getPlacemehntResult(placements);

        const { result, placePerecntage, numPlacedParts, numParts } = placementResult;
        
        if (this.#isWorking) {
            displayCallback(result, placePerecntage, numPlacedParts, numParts);
            this.launchWorkers(displayCallback);
        }
    }

    public stop(isClean: boolean): void {
        this.#isWorking = false;

        if (this.#workerTimer) {
            clearInterval(this.#workerTimer);
            this.#workerTimer = 0;
        }

        this.#paralele.terminate();

        if (isClean) {
            this.#wasmPacker.stop();
        }
    }
}
