import { SVGParser } from 'svg-parser';

import { GeneticAlgorithm } from './genetic-algorithm';
import { Parallel } from './parallel';
import { polygonArea, almostEqual, getPolygonBounds } from './geometry-util';
import { cleanPolygon, offsetPolygon } from './helpers';

function getPlacementWorkerData(binPolygon, paths, ids, rotations, config, nfpCache = {}) {
    return {
        binPolygon,
        paths,
        ids,
        rotations,
        config,
        nfpCache
    };
}

export default class SvgNest {
    #geneticAlgorithm;

    constructor() {
        this.tree = null;
        this.binPolygon = null;
        this.binBounds = null;
        this.nfpCache = {};
        this.configuration = {
            clipperScale: 10000000,
            curveTolerance: 0.3,
            spacing: 0,
            rotations: 4,
            populationSize: 10,
            mutationRate: 10,
            useHoles: false,
            exploreConcave: false
        };

        this.working = false;

        this.#geneticAlgorithm = null;
        this.best = null;
        this.workerTimer = null;
        this.progress = 0;
        this.svgParser = new SVGParser(cleanPolygon);
    }

    parseSvg(svgString) {
        // reset if in progress
        this.stop();

        this.svgParser.init(svgString);

        return {
            source: this.svgParser.svgString,
            attributes: this.svgParser.svgAttributes
        };
    }

    setBin(element) {
        this.svgParser.setBin(element);
    }

    config(configuration) {
        this.configuration = {
            ...this.configuration,
            ...configuration
        };

        this.best = null;
        this.nfpCache = {};
        this.binPolygon = null;
        this.#geneticAlgorithm = null;

        return this.configuration;
    }

    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    start(progressCallback, displayCallback) {
        // build tree without bin
        this.tree = this.svgParser.getTree(this.configuration);
        const polygomCount = this.tree.length;
        let i = 0;

        for (i = 0; i < polygomCount; ++i) {
            offsetPolygon(this.tree[i], this.configuration, 1);
        }

        this.binPolygon = this.svgParser.binPolygon;

        if (this.binPolygon.length < 3) {
            return false;
        }

        this.binBounds = getPolygonBounds(this.binPolygon);

        offsetPolygon(this.binPolygon, this.configuration, -1);
        this.binPolygon.id = -1;

        let point = this.binPolygon[0];
        // put bin on origin
        let xbinmax = point.x;
        let xbinmin = point.x;
        let ybinmax = point.y;
        let ybinmin = point.y;
        const binSize = this.binPolygon.length;

        for (i = 1; i < binSize; ++i) {
            point = this.binPolygon[i];
            if (point.x > xbinmax) {
                xbinmax = point.x;
            } else if (point.x < xbinmin) {
                xbinmin = point.x;
            }
            if (point.y > ybinmax) {
                ybinmax = point.y;
            } else if (point.y < ybinmin) {
                ybinmin = point.y;
            }
        }

        for (i = 0; i < binSize; ++i) {
            point = this.binPolygon[i];
            point.x = point.x - xbinmin;
            point.y = point.y - ybinmin;
        }

        this.binPolygon.width = xbinmax - xbinmin;
        this.binPolygon.height = ybinmax - ybinmin;

        // all paths need to have the same winding direction
        if (polygonArea(this.binPolygon) > 0) {
            this.binPolygon.reverse();
        }

        let start = null;
        let end = null;
        let node = null;
        // remove duplicate endpoints, ensure counterclockwise winding direction
        for (i = 0; i < this.tree.length; ++i) {
            node = this.tree[i];
            start = node[0];
            end = node[node.length - 1];

            if (start === end || (almostEqual(start.x, end.x) && almostEqual(start.y, end.y))) {
                node.pop();
            }

            if (polygonArea(node) > 0) {
                node.reverse();
            }
        }

        this.working = false;

        this.workerTimer = setInterval(() => {
            if (!this.working) {
                this.launchWorkers(this.tree, this.binPolygon, this.configuration, progressCallback, displayCallback);
                this.working = true;
            }

            progressCallback(this.progress);
        }, 100);
    }

    launchWorkers(tree, binPolygon, configuration, progressCallback, displayCallback) {
        let i, j;

        if (this.#geneticAlgorithm === null) {
            // initiate new GA
            const adam = tree.slice(0);

            // seed with decreasing area
            adam.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));

            this.#geneticAlgorithm = new GeneticAlgorithm(adam, binPolygon, configuration);
        }

        let individual = null;

        // evaluate all members of the population
        for (i = 0; i < this.#geneticAlgorithm.population.length; ++i) {
            if (!this.#geneticAlgorithm.population[i].fitness) {
                individual = this.#geneticAlgorithm.population[i];
                break;
            }
        }

        if (individual === null) {
            // all individuals have been evaluated, start next generation
            this.#geneticAlgorithm.generation();
            individual = this.#geneticAlgorithm.population[1];
        }

        const placeList = individual.placement;
        const rotations = individual.rotation;
        const placeCount = placeList.length;
        const ids = [];
        const nfpPairs = [];
        const newCache = {};
        let stringKey = '';
        let key;
        let part;

        const updateCache = (polygon1, polygon2, rotation1, rotation2, inside) => {
            key = {
                A: polygon1.id,
                B: polygon2.id,
                inside,
                Arotation: rotation1,
                Brotation: rotation2
            };

            stringKey = JSON.stringify(key);

            if (!this.nfpCache[stringKey]) {
                nfpPairs.push({ A: polygon1, B: polygon2, key });
            } else {
                newCache[stringKey] = this.nfpCache[stringKey];
            }
        };

        for (i = 0; i < placeCount; ++i) {
            part = placeList[i];
            ids.push(part.id);
            part.rotation = rotations[i];

            updateCache(binPolygon, part, 0, rotations[i], true);

            for (j = 0; j < i; ++j) {
                updateCache(placeList[j], part, rotations[j], rotations[i], false);
            }
        }

        // only keep cache for one cycle
        this.nfpCache = newCache;

        const placementWorkerData = getPlacementWorkerData(
            binPolygon,
            placeList.slice(0),
            ids,
            rotations,
            configuration,
            this.nfpCache
        );

        let spawnCount = 0;

        const onSpawn = () => {
            this.progress = spawnCount++ / nfpPairs.length;
        };

        const parallel = new Parallel(
            'pair',
            nfpPairs,
            {
                binPolygon,
                searchEdges: configuration.exploreConcave,
                useHoles: configuration.useHoles
            },
            onSpawn
        );

        parallel.then(
            generatedNfp => {
                if (generatedNfp) {
                    let i = 0;
                    let Nfp;
                    let key;

                    for (i = 0; i < generatedNfp.length; ++i) {
                        Nfp = generatedNfp[i];

                        if (Nfp) {
                            // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
                            key = JSON.stringify(Nfp.key);
                            this.nfpCache[key] = Nfp.value;
                        }
                    }
                }

                placementWorkerData.nfpCache = this.nfpCache;

                // can't use .spawn because our data is an array
                const p2 = new Parallel('placement', [placeList.slice()], placementWorkerData);

                p2.then(
                    placements => {
                        if (!placements || placements.length == 0) {
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

                        if (!this.best || bestResult.fitness < this.best.fitness) {
                            this.best = bestResult;

                            let placedArea = 0;
                            let totalArea = 0;
                            let numPlacedParts = 0;
                            let bestPlacement;
                            const numParts = placeList.length;

                            for (i = 0; i < this.best.placements.length; ++i) {
                                totalArea = totalArea + Math.abs(polygonArea(binPolygon));
                                bestPlacement = this.best.placements[i];

                                numPlacedParts = numPlacedParts + bestPlacement.length;

                                for (j = 0; j < bestPlacement.length; ++j) {
                                    placedArea = placedArea + Math.abs(polygonArea(tree[bestPlacement[j].id]));
                                }
                            }

                            const placement = this.svgParser.applyPlacement(this.best.placements, this.tree, this.binBounds);

                            displayCallback(placement, placedArea / totalArea, numPlacedParts, numParts);
                        } else {
                            displayCallback('', 0, 0, 0);
                        }
                        this.working = false;
                    },
                    err => {
                        console.log(err);
                    }
                );
            },
            err => {
                console.log(err);
            }
        );
    }

    stop() {
        this.working = false;

        if (this.workerTimer) {
            clearInterval(this.workerTimer);
            this.workerTimer = null;
        }
    }
}
