import { SVGParser } from 'svg-parser';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import { cleanPolygon, offsetPolygon, getPolygonBounds, polygonArea, normalizePolygon } from './helpers';

export default class SvgNest {
    #geneticAlgorithm = new GeneticAlgorithm();

    #svgParser = new SVGParser(cleanPolygon);

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

    #nfpCache = {};

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
        this.#nfpCache = {};
        this.#binPolygon = null;
        this.#geneticAlgorithm.clean();

        return this.#configuration;
    }

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    start(progressCallback, displayCallback) {
        // build tree without bin
        this.#tree = this.#svgParser.getTree(this.#configuration);
        const polygonCount = this.#tree.length;
        let i = 0;

        for (i = 0; i < polygonCount; ++i) {
            offsetPolygon(this.#tree[i], this.#configuration, 1);
        }

        this.#binPolygon = this.#svgParser.binPolygon;

        if (this.#binPolygon.length < 3) {
            return false;
        }

        this.#binBounds = getPolygonBounds(this.#binPolygon);

        offsetPolygon(this.#binPolygon, this.#configuration, -1);
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

    updateCache(polygon1, polygon2, rotation1, rotation2, inside, nfpPairs, newCache) {
        const key = {
            A: polygon1.id,
            B: polygon2.id,
            inside,
            Arotation: rotation1,
            Brotation: rotation2
        };

        const stringKey = JSON.stringify(key);

        if (!this.#nfpCache[stringKey]) {
            nfpPairs.push({ A: polygon1, B: polygon2, key });
        } else {
            newCache[stringKey] = this.#nfpCache[stringKey];
        }
    }

    initNfp(individual) {
        const placeList = individual.placement;
        const rotations = individual.rotation;
        const placeCount = placeList.length;
        const nfpPairs = [];
        const ids = [];
        const newCache = {};
        let part = null;
        let i = 0;
        let j = 0;

        for (i = 0; i < placeCount; ++i) {
            part = placeList[i];
            ids.push(part.id);
            part.rotation = rotations[i];

            this.updateCache(this.#binPolygon, part, 0, rotations[i], true, nfpPairs, newCache);

            for (j = 0; j < i; ++j) {
                this.updateCache(placeList[j], part, rotations[j], rotations[i], false, nfpPairs, newCache);
            }
        }

        // only keep cache for one cycle
        this.#nfpCache = newCache;

        return { nfpPairs, ids };
    }

    updateNfp(generatedNfp) {
        if (generatedNfp) {
            const nfpCount = generatedNfp.length;
            let i = 0;
            let nfp = null;
            let key = '';

            for (i = 0; i < nfpCount; ++i) {
                nfp = generatedNfp[i];

                if (nfp) {
                    // a null nfp means the nfp could not be generated, either because the parts simply don't
                    // fit or an error in the nfp algo
                    key = JSON.stringify(nfp.key);
                    this.#nfpCache[key] = nfp.value;
                }
            }
        }

        return this.#nfpCache;
    }

    launchWorkers(displayCallback) {
        if (this.#isWorking) {
            return;
        }

        this.#geneticAlgorithm.init(this.#tree, this.#binPolygon, this.#configuration);

        const individual = this.#geneticAlgorithm.individual;
        const { nfpPairs, ids } = this.initNfp(individual);

        let spawnCount = 0;

        const onSpawn = () => {
            this.#progress = spawnCount++ / nfpPairs.length;
        };

        const parallel = new Parallel(
            'pair',
            nfpPairs,
            {
                binPolygon: this.#binPolygon,
                searchEdges: this.#configuration.exploreConcave,
                useHoles: this.#configuration.useHoles
            },
            onSpawn
        );

        parallel.then(
            generatedNfp => this.onPair(generatedNfp, ids, individual, displayCallback),
            error => console.log(error)
        );

        this.#isWorking = true;
    }

    onPair(generatedNfp, ids, individual, displayCallback) {
        const placeList = individual.placement;
        const rotations = individual.rotation;
        const placementWorkerData = {
            binPolygon: this.#binPolygon,
            paths: placeList.slice(),
            ids,
            rotations,
            config: this.#configuration,
            nfpCache: this.updateNfp(generatedNfp)
        };

        // can't use .spawn because our data is an array
        const p2 = new Parallel('placement', [placeList.slice()], placementWorkerData);

        p2.then(
            placements => this.onPlacement(placements, individual, placeList, displayCallback),
            error => console.log(error)
        );
    }

    onPlacement(placements, individual, placeList, displayCallback) {
        if (!placements || placements.length === 0) {
            return;
        }

        let i = 0;
        let j = 0;
        let bestResult = placements[0];

        individual.fitness = bestResult.fitness;

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
            const numParts = placeList.length;

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
            this.#workerTimer = null;
        }
    }
}
