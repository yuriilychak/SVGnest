import { SVGParser } from 'svg-parser';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import { getPolygonBounds, polygonArea, normalizePolygon } from './helpers';
import ClipperWrapper from './clipper-wrapper';
import NFPStore from './nfp-store';
import {
    BoundRect,
    DisplayCallback,
    IPolygon,
    NestConfig,
    PairWorkerResult,
    PlacementWorkerResult,
    WORKER_TYPE
} from './types';

export default class PolygonPacker {
    #geneticAlgorithm = new GeneticAlgorithm();

    // eslint-disable-next-line
    #svgParser: SVGParser = new SVGParser();

    #tree: IPolygon[] = null;

    #configuration: NestConfig = {
        clipperScale: 10000000,
        curveTolerance: 0.3,
        spacing: 0,
        rotations: 4,
        populationSize: 10,
        mutationRate: 10,
        useHoles: false,
        exploreConcave: false
    };

    #binPolygon: IPolygon = null;

    #binBounds: BoundRect = null;

    #isWorking: boolean = false;

    #best: PlacementWorkerResult = null;

    #progress: number = 0;

    #workerTimer: number = 0;

    #nfpStore: NFPStore = new NFPStore();

    public parseSvg(svgString: string): { source: string; attributes: object } {
        // reset if in progress
        this.stop();

        this.#svgParser.init(svgString);

        return {
            source: this.#svgParser.svgString,
            attributes: this.#svgParser.svgAttributes
        };
    }

    public setBin(element: SVGElement): void {
        this.#svgParser.setBin(element);
    }

    public config(configuration: NestConfig): void {
        this.#configuration = { ...this.#configuration, ...configuration };

        this.#best = null;
        this.#binPolygon = null;
        this.#geneticAlgorithm.clean();
        this.#nfpStore.clean();
    }

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public start(progressCallback: (progress: number) => void, displayCallback: DisplayCallback): void {
        const clipperWrapper = new ClipperWrapper(this.#configuration);
        // build tree without bin
        this.#tree = this.#svgParser.getTree(this.#configuration, clipperWrapper);
        const polygonCount = this.#tree.length;
        let i = 0;

        for (i = 0; i < polygonCount; ++i) {
            clipperWrapper.offsetPolygon(this.#tree[i], 1);
        }

        this.#binPolygon = this.#svgParser.binPolygon;

        if (this.#binPolygon.length < 3) {
            return;
        }

        this.#binBounds = getPolygonBounds(this.#binPolygon);

        clipperWrapper.offsetPolygon(this.#binPolygon, -1);
        this.#binPolygon.id = -1;

        const currentBounds = getPolygonBounds(this.#binPolygon);
        const binSize = this.#binPolygon.length;
        let point = null;

        for (i = 0; i < binSize; ++i) {
            point = this.#binPolygon[i];
            point.x = point.x - currentBounds.x;
            point.y = point.y - currentBounds.y;
        }

        this.#binPolygon.width = currentBounds.width;
        this.#binPolygon.height = currentBounds.height;

        // all paths need to have the same winding direction
        if (polygonArea(this.#binPolygon) > 0) {
            this.#binPolygon.reverse();
        }

        // remove duplicate endpoints, ensure counterclockwise winding direction
        for (i = 0; i < polygonCount; ++i) {
            normalizePolygon(this.#tree[i]);
        }

        this.#isWorking = false;

        this.#workerTimer = setInterval(() => {
            this.launchWorkers(displayCallback);

            progressCallback(this.#progress);
        }, 100) as unknown as number;
    }

    launchWorkers(displayCallback: DisplayCallback) {
        if (this.#isWorking) {
            return;
        }

        this.#geneticAlgorithm.init(this.#tree, this.#binPolygon, this.#configuration);
        this.#nfpStore.init(this.#geneticAlgorithm.individual, this.#binPolygon, this.#configuration.rotations);

        let spawnCount = 0;

        const onSpawn = () => {
            this.#progress = spawnCount++ / this.#nfpStore.nfpPairs.length;
        };

        const parallel = new Parallel(WORKER_TYPE.PAIR, this.#nfpStore.nfpPairs, this.#configuration, onSpawn);

        parallel.then(
            (generatedNfp: PairWorkerResult[]) => this.onPair(generatedNfp, displayCallback),
            error => console.log(error)
        );

        this.#isWorking = true;
    }

    private onPair(generatedNfp: PairWorkerResult[], displayCallback: DisplayCallback): void {
        const placementWorkerData = this.#nfpStore.getPlacementWorkerData(generatedNfp, this.#configuration, this.#binPolygon);

        // can't use .spawn because our data is an array
        const parallel: Parallel = new Parallel(WORKER_TYPE.PLACEMENT, [this.#nfpStore.clonePlacement()], placementWorkerData);

        parallel.then(
            (placements: PlacementWorkerResult[]) => this.onPlacement(placements, displayCallback),
            error => console.log(error)
        );
    }

    private onPlacement(placements: PlacementWorkerResult[], displayCallback: DisplayCallback): void {
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

        if (!this.#best || bestResult.fitness < this.#best.fitness) {
            this.#best = bestResult;

            let placedArea: number = 0;
            let totalArea: number = 0;
            let numPlacedParts: number = 0;
            let bestPlacement = null;
            const numParts: number = this.#nfpStore.placementCount;
            const placementCount = this.#best.placements.length;

            for (i = 0; i < placementCount; ++i) {
                totalArea = totalArea + Math.abs(polygonArea(this.#binPolygon));
                bestPlacement = this.#best.placements[i];

                numPlacedParts = numPlacedParts + bestPlacement.length;

                for (j = 0; j < bestPlacement.length; ++j) {
                    placedArea = placedArea + Math.abs(polygonArea(this.#tree[bestPlacement[j].id]));
                }
            }

            const placement: string = this.#svgParser.applyPlacement(this.#best.placements, this.#tree, this.#binBounds);

            displayCallback(placement, placedArea / totalArea, numPlacedParts, numParts);
        } else {
            displayCallback('', 0, 0, 0);
        }

        this.#isWorking = false;
    }

    public stop(): void {
        this.#isWorking = false;

        if (this.#workerTimer) {
            clearInterval(this.#workerTimer);
            this.#workerTimer = 0;
        }
    }
}
