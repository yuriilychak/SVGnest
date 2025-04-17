import { ClipperWrapper, getUint16, readUint32FromF32, PolygonF32 } from 'geometry-utils';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import NFPStore from './nfp-store';
import { BoundRectF32, DisplayCallback, NestConfig, PolygonNode } from './types';

export default class PolygonPacker {
    #geneticAlgorithm = new GeneticAlgorithm();

    #binNode: PolygonNode = null;

    #binArea: number = 0;

    #binBounds: BoundRectF32 = null;

    #resultBounds: BoundRectF32 = null;

    #isWorking: boolean = false;

    #best: Float32Array = null;

    #progress: number = 0;

    #workerTimer: number = 0;

    #nfpStore: NFPStore = new NFPStore();

    #paralele: Parallel = new Parallel();

    #nodes: PolygonNode[] = [];

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public start(
        configuration: NestConfig,
        polygons: Float32Array[],
        binPolygon: Float32Array,
        progressCallback: (progress: number) => void,
        displayCallback: DisplayCallback
    ): void {
        const clipperWrapper = new ClipperWrapper(configuration);
        const binData = clipperWrapper.generateBounds(binPolygon);

        this.#binNode = binData.binNode;
        this.#binBounds = binData.bounds;
        this.#resultBounds = binData.resultBounds;
        this.#binArea = binData.area;
        this.#isWorking = true;
        this.#nodes = clipperWrapper.generateTree(polygons);

        this.launchWorkers(configuration, displayCallback);

        this.#workerTimer = setInterval(() => {
            progressCallback(this.#progress);
        }, 100) as unknown as number;
    }

    private onSpawn = (spawnCount: number): void => {
        this.#progress = spawnCount / this.#nfpStore.nfpPairs.length;
    };

    launchWorkers(configuration: NestConfig, displayCallback: DisplayCallback) {
        this.#geneticAlgorithm.init(this.#nodes, this.#resultBounds, configuration);
        this.#nfpStore.init(this.#geneticAlgorithm.individual, this.#binNode, configuration);
        this.#paralele.start(
            this.#nfpStore.nfpPairs,
            (generatedNfp: ArrayBuffer[]) => this.onPair(configuration, generatedNfp, displayCallback),
            this.onError,
            this.onSpawn
        );
    }

    private onError(error: ErrorEvent) {
        console.log(error);
    }

    private onPair(configuration: NestConfig, generatedNfp: ArrayBuffer[], displayCallback: DisplayCallback): void {
        this.#nfpStore.update(generatedNfp);

        this.#paralele.start(
            this.#nfpStore.getPlacementData(this.#binArea),
            (placements: ArrayBuffer[]) => this.onPlacement(configuration, placements, displayCallback),
            this.onError
        );
    }

    private onPlacement(configuration: NestConfig, placements: ArrayBuffer[], displayCallback: DisplayCallback): void {
        if (placements.length === 0) {
            return;
        }

        let i: number = 0;
        let placementsData: Float32Array = new Float32Array(placements[0]);
        let currentPlacement: Float32Array = null;
        this.#nfpStore.fitness = placementsData[0];

        for (i = 1; i < placements.length; ++i) {
            currentPlacement = new Float32Array(placements[i]);
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

            const binArea: number = Math.abs(this.#binArea);
            const polygon: PolygonF32 = PolygonF32.create();
            const placementCount = placementsData[1];
            let placedCount: number = 0;
            let placedArea: number = 0;
            let totalArea: number = 0;
            let pathId: number = 0;
            let itemData: number = 0;
            let offset: number = 0;
            let size: number = 0;
            let i: number = 0;
            let j: number = 0;

            for (i = 0; i < placementCount; ++i) {
                totalArea += binArea;
                itemData = readUint32FromF32(placementsData, 2 + i);
                offset = getUint16(itemData, 1);
                size = getUint16(itemData, 0);
                placedCount += size;

                for (j = 0; j < size; ++j) {
                    pathId = getUint16(readUint32FromF32(placementsData, offset + j), 1);
                    polygon.bind(this.#nodes[pathId].memSeg);
                    placedArea += polygon.absArea;
                }
            }

            numParts = this.#nfpStore.placementCount;
            numPlacedParts = placedCount;
            placePerecntage = placedArea / totalArea;
            result = {
                placementsData,
                nodes: this.#nodes,
                bounds: this.#binBounds,
                angleSplit: configuration.rotations
            };
        }

        if (this.#isWorking) {
            displayCallback(result, placePerecntage, numPlacedParts, numParts);
            this.launchWorkers(configuration, displayCallback);
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
            this.#binNode = null;
            this.#geneticAlgorithm.clean();
            this.#nfpStore.clean();
        }
    }
}
