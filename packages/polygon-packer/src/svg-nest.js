import { SVGParser } from 'svg-parser';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import { getPolygonBounds, polygonArea, normalizePolygon } from './helpers';
import ClipperWrapper from './clipper-wrapper';
import NFPStore from './nfp-store';

export default class SvgNest {
    #geneticAlgorithm = new GeneticAlgorithm();

    #svgParser = new SVGParser();

    #tree = null;

    #configuration = {
        clipperScale: 10000000,
        curveTolerance: 0.3,
        spacing: 0,
        rotations: 4,
        populationSize: 10,
        mutationRate: 10,
        useHoles: false,
        exploreConcave: false
    };

    #binPolygon = null;

    #binBounds = null;

    #isWorking = false;

    #best = null;

    #progress = 0;

    #workerTimer = 0;

    #nfpStore = new NFPStore();

    parseSvg(svgString) {
        // reset if in progress
        this.stop();

        this.#svgParser.init(svgString);

        return {
            source: this.#svgParser.svgString,
            attributes: this.#svgParser.svgAttributes
        };
    }

    setBin(element) {
        this.#svgParser.setBin(element);
    }

    config(configuration) {
        this.#configuration = { ...this.#configuration, ...configuration };

        this.#best = null;
        this.#binPolygon = null;
        this.#geneticAlgorithm.clean();
        this.#nfpStore.clean();

        return this.#configuration;
    }

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    start(progressCallback, displayCallback) {
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
            return false;
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
        }, 100);
    }

    launchWorkers(displayCallback) {
        if (this.#isWorking) {
            return;
        }

        this.#geneticAlgorithm.init(this.#tree, this.#binPolygon, this.#configuration);
        this.#nfpStore.init(this.#geneticAlgorithm.individual, this.#binPolygon);

        let spawnCount = 0;

        const onSpawn = () => {
            this.#progress = spawnCount++ / this.#nfpStore.nfpPairs.length;
        };

        const parallel = new Parallel(
            'pair',
            this.#nfpStore.nfpPairs,
            {
                binPolygon: this.#binPolygon,
                searchEdges: this.#configuration.exploreConcave,
                useHoles: this.#configuration.useHoles
            },
            onSpawn
        );

        parallel.then(
            generatedNfp => this.onPair(generatedNfp, displayCallback),
            error => console.log(error)
        );

        this.#isWorking = true;
    }

    onPair(generatedNfp, displayCallback) {
        const placementWorkerData = this.#nfpStore.getPlacementWorkerData(generatedNfp, this.#configuration, this.#binPolygon);

        // can't use .spawn because our data is an array
        const p2 = new Parallel('placement', [this.#nfpStore.clonePlacement()], placementWorkerData);

        p2.then(
            placements => this.onPlacement(placements, displayCallback),
            error => console.log(error)
        );
    }

    onPlacement(placements, displayCallback) {
        if (!placements || placements.length === 0) {
            return;
        }

        let i = 0;
        let j = 0;
        let bestResult = placements[0];

        this.#nfpStore.fitness = bestResult.fitness;

        for (i = 1; i < placements.length; ++i) {
            if (placements[i].fitness < bestResult.fitness) {
                bestResult = placements[i];
            }
        }

        if (!this.#best || bestResult.fitness < this.#best.fitness) {
            this.#best = bestResult;

            let placedArea = 0;
            let totalArea = 0;
            let numPlacedParts = 0;
            let bestPlacement = null;
            const numParts = this.#nfpStore.placementCount;

            for (i = 0; i < this.#best.placements.length; ++i) {
                totalArea = totalArea + Math.abs(polygonArea(this.#binPolygon));
                bestPlacement = this.#best.placements[i];

                numPlacedParts = numPlacedParts + bestPlacement.length;

                for (j = 0; j < bestPlacement.length; ++j) {
                    placedArea = placedArea + Math.abs(polygonArea(this.#tree[bestPlacement[j].id]));
                }
            }

            const placement = this.#svgParser.applyPlacement(this.#best.placements, this.#tree, this.#binBounds);

            displayCallback(placement, placedArea / totalArea, numPlacedParts, numParts);
        } else {
            displayCallback('', 0, 0, 0);
        }

        this.#isWorking = false;
    }

    stop() {
        this.#isWorking = false;

        if (this.#workerTimer) {
            clearInterval(this.#workerTimer);
            this.#workerTimer = 0;
        }
    }
}
