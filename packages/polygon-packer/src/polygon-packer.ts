import { ClipperWrapper, getPlacementData, legacyToPolygonNodes } from 'geometry-utils';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import NFPStore from './nfp-store';
import { BoundRect, DisplayCallback, IPoint, IPolygon, NestConfig, PolygonNode, THREAD_TYPE } from './types';

export default class PolygonPacker {
    #geneticAlgorithm = new GeneticAlgorithm();

    #binPolygon: IPolygon = null;

    #binArea: number = 0;

    #binBounds: BoundRect = null;

    #resultBounds: BoundRect = null;

    #isWorking: boolean = false;

    #best: Float64Array = null;

    #progress: number = 0;

    #workerTimer: number = 0;

    #nfpStore: NFPStore = new NFPStore();

    #paralele: Parallel = new Parallel();

    #nodes: PolygonNode[] = [];

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public start(
        configuration: NestConfig,
        polygons: IPoint[][],
        binPolygon: IPoint[],
        progressCallback: (progress: number) => void,
        displayCallback: DisplayCallback
    ): void {
        const clipperWrapper = new ClipperWrapper(configuration);
        const tree = clipperWrapper.generateTree(polygons);
        const binData = clipperWrapper.generateBounds(binPolygon);

        this.#binPolygon = binData.binPolygon;
        this.#binBounds = binData.bounds;
        this.#resultBounds = binData.resultBounds;
        this.#binArea = binData.area;
        this.#isWorking = true;
        this.#nodes = legacyToPolygonNodes(tree);

        this.launchWorkers(tree, configuration, displayCallback);

        this.#workerTimer = setInterval(() => {
            progressCallback(this.#progress);
        }, 100) as unknown as number;
    }

    private onSpawn = (spawnCount: number): void => {
        this.#progress = spawnCount / this.#nfpStore.nfpPairs.length;
    };

    launchWorkers(tree: IPolygon[], configuration: NestConfig, displayCallback: DisplayCallback) {
        this.#geneticAlgorithm.init(tree, this.#resultBounds, configuration);
        this.#nfpStore.init(this.#geneticAlgorithm.individual, this.#binPolygon, configuration.rotations);
        this.#paralele.start(
            THREAD_TYPE.PAIR,
            this.#nfpStore.nfpPairs,
            configuration,
            (generatedNfp: ArrayBuffer[]) => this.onPair(tree, configuration, generatedNfp, displayCallback),
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
        generatedNfp: ArrayBuffer[],
        displayCallback: DisplayCallback
    ): void {
        const placementWorkerData = this.#nfpStore.getPlacementWorkerData(generatedNfp, this.#binArea);

        // can't use .spawn because our data is an array
        this.#paralele.start(
            THREAD_TYPE.PLACEMENT,
            [this.#nfpStore.exportPlacement()],
            placementWorkerData,
            (placements: ArrayBuffer[]) => this.onPlacement(tree, configuration, placements, displayCallback),
            this.onError
        );
    }

    private onPlacement(
        tree: IPolygon[],
        configuration: NestConfig,
        placements: ArrayBuffer[],
        displayCallback: DisplayCallback
    ): void {
        if (placements.length === 0) {
            return;
        }

        let i: number = 0;
        let placementsData: Float64Array = new Float64Array(placements[0]);
        let currentPlacement: Float64Array = null;
        this.#nfpStore.fitness = placementsData[0];

        for (i = 1; i < placements.length; ++i) {
            currentPlacement = new Float64Array(placements[i]);
            if (currentPlacement[0] < placementsData[0]) {
                placementsData = currentPlacement;
            }
        }

        let result = null;
        let numParts: number = 0;
        let numPlacedParts: number = 0;
        let placePerecntage: number = 0;

        if (!this.#best || placementsData[0] < this.#best[0]) {
            this.#best = placementsData;

            const placementData: number = getPlacementData(Math.abs(this.#binArea), this.#nodes, placementsData);

            numParts = this.#nfpStore.placementCount;
            numPlacedParts = placementData << 0;
            placePerecntage = placementData % 1;
            result = {
                placementsData,
                nodes: this.#nodes,
                bounds: this.#binBounds,
                angleSplit: configuration.rotations
            };
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
            this.#nodes = [];
            this.#best = null;
            this.#binPolygon = null;
            this.#geneticAlgorithm.clean();
            this.#nfpStore.clean();
        }
    }
}
