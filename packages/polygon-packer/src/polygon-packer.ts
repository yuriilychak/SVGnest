import { polygonArea } from 'geometry-utils';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import NFPStore from './nfp-store';
import { BoundRect, DisplayCallback, IPolygon, NestConfig, PlacementWorkerResult, THREAD_TYPE } from './types';

export default class PolygonPacker {
    #geneticAlgorithm = new GeneticAlgorithm();

    #binPolygon: IPolygon = null;

    #binBounds: BoundRect = null;

    #isWorking: boolean = false;

    #best: PlacementWorkerResult = null;

    #progress: number = 0;

    #workerTimer: number = 0;

    #nfpStore: NFPStore = new NFPStore();

    #paralele: Parallel = new Parallel();

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public start(
        configuration: NestConfig,
        tree: IPolygon[],
        binData: { binPolygon: IPolygon; bounds: BoundRect },
        progressCallback: (progress: number) => void,
        displayCallback: DisplayCallback
    ): void {
        this.#binPolygon = binData.binPolygon;
        this.#binBounds = binData.bounds;
        this.#isWorking = true;

        this.launchWorkers(tree, configuration, displayCallback);

        this.#workerTimer = setInterval(() => {
            progressCallback(this.#progress);
        }, 100) as unknown as number;
    }

    private onSpawn = (spawnCount: number): void => {
        this.#progress = spawnCount / this.#nfpStore.nfpPairs.length;
    };

    launchWorkers(tree: IPolygon[], configuration: NestConfig, displayCallback: DisplayCallback) {
        this.#geneticAlgorithm.init(tree, this.#binPolygon, configuration);
        this.#nfpStore.init(this.#geneticAlgorithm.individual, this.#binPolygon, configuration.rotations);
        this.#paralele.start(
            THREAD_TYPE.PAIR,
            this.#nfpStore.nfpPairs,
            configuration,
            (generatedNfp: Float64Array[]) => this.onPair(tree, configuration, generatedNfp, displayCallback),
            this.onError,
            this.onSpawn
        );
    }

    private onError(error: ErrorEvent) {
        console.log(error);
    }

    private onPair(
        tree: IPolygon[],
        configuration: NestConfig,
        generatedNfp: Float64Array[],
        displayCallback: DisplayCallback
    ): void {
        const placementWorkerData = this.#nfpStore.getPlacementWorkerData(generatedNfp, configuration, this.#binPolygon);

        // can't use .spawn because our data is an array
        this.#paralele.start(
            THREAD_TYPE.PLACEMENT,
            [this.#nfpStore.clonePlacement()],
            placementWorkerData,
            (placements: PlacementWorkerResult[]) => this.onPlacement(tree, configuration, placements, displayCallback),
            this.onError
        );
    }

    private onPlacement(
        tree: IPolygon[],
        configuration: NestConfig,
        placements: PlacementWorkerResult[],
        displayCallback: DisplayCallback
    ): void {
        if (!placements || placements.length === 0) {
            return;
        }

        let i: number = 0;
        let j: number = 0;
        let bestResult: PlacementWorkerResult = placements[0];

        this.#nfpStore.fitness = bestResult.fitness;

        for (i = 1; i < placements.length; ++i) {
            if (placements[i].fitness < bestResult.fitness) {
                bestResult = placements[i];
            }
        }

        let result = null;
        let numParts: number = 0;
        let numPlacedParts: number = 0;
        let placePerecntage: number = 0;

        if (!this.#best || bestResult.fitness < this.#best.fitness) {
            this.#best = bestResult;

            const placementCount = this.#best.pathItems.length;
            const binArea: number = Math.abs(polygonArea(this.#binPolygon));
            let placedArea: number = 0;
            let totalArea: number = 0;
            let pathId: number = 0;
            let bestItems: number[] = null;

            for (i = 0; i < placementCount; ++i) {
                totalArea += binArea;
                bestItems = this.#best.pathItems[i];

                numPlacedParts += bestItems.length;

                for (j = 0; j < bestItems.length; ++j) {
                    pathId = bestItems[j] >> 16;
                    placedArea += Math.abs(polygonArea(tree[pathId]));
                }
            }

            result = {
                placements: this.#best.placements,
                pathItems: this.#best.pathItems,
                tree,
                bounds: this.#binBounds,
                angleSplit: configuration.rotations
            };
            numParts = this.#nfpStore.placementCount;
            placePerecntage = placedArea / totalArea;
        }

        if (this.#isWorking) {
            displayCallback(result, placePerecntage, numPlacedParts, numParts);
            this.launchWorkers(tree, configuration, displayCallback);
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
            this.#best = null;
            this.#binPolygon = null;
            this.#geneticAlgorithm.clean();
            this.#nfpStore.clean();
        }
    }
}
