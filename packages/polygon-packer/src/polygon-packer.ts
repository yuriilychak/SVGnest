import { serializeConfig } from './helpers';
import { Parallel } from './parallel';
import PlacementWrapper from './placement-wrapper';
import { DisplayCallback, f32, NestConfig, u16, u32, usize } from './types';
import WasmPacker from './wasm-packer';

export default class PolygonPacker {
    #wasmPacker = new WasmPacker();

    #isWorking: boolean = false;

    #progress: number = 0;

    #workerTimer: u32 = 0;

    #paralele: Parallel = new Parallel();

    static deserializePairs(data: Uint8Array): ArrayBuffer[] {
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        let offset = 0;

        // Read count
        const count = view.getUint32(offset, true);
        offset += 4;

        const pairs: ArrayBuffer[] = [];

        // Read each pair
        for (let i = 0; i < count; i++) {
            const size = view.getUint32(offset, true);
            offset += 4;

            const pairData = new ArrayBuffer(size);
            new Uint8Array(pairData).set(new Uint8Array(data.buffer, data.byteOffset + offset, size));
            offset += size;

            pairs.push(pairData);
        }

        return pairs;
    }

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public start(
        configuration: NestConfig,
        polygons: Float32Array[],
        binPolygon: Float32Array,
        progressCallback: (progress: number) => void,
        displayCallback: DisplayCallback
    ): void {
        const allPolygons = polygons.concat([binPolygon]);
        const sizes: u16[] = [];
        const polygonData: f32[] = [];
        let size: usize = 0;

        for (let i = 0; i < allPolygons.length; ++i) {
            size = allPolygons[i].length;
            sizes.push(size as u16);

            for (let j = 0; j < size; ++j) {
                polygonData.push(allPolygons[i][j]);
            }
        }

        this.#wasmPacker.init(serializeConfig(configuration), new Float32Array(polygonData), new Uint16Array(sizes));
        this.#isWorking = true;

        this.launchWorkers(displayCallback);

        this.#workerTimer = setInterval(() => {
            progressCallback(this.#progress);
        }, 100) as unknown as u32;
    }

    private onSpawn = (spawnCount: number): void => {
        this.#progress = spawnCount / this.#wasmPacker.pairCount;
    };

    launchWorkers(displayCallback: DisplayCallback) {
        const serializedPairs = this.#wasmPacker.getPairs();
        const pairs = PolygonPacker.deserializePairs(serializedPairs);
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
        const placementWrapper = new PlacementWrapper(placementResult.buffer);

        if (this.#isWorking) {
            displayCallback(placementWrapper);
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
