/*!
 * SvgNest
 * Licensed under the MIT license
 */

import { GeneticAlgorithm } from "../genetic-algorithm";
import { SvgParser } from "../svg-parser";
import { Parallel } from "../parallel";
import { polygonArea, almostEqual } from "../geometry-util";
import { TreePolygon, BinPolygon } from "./polygon";
import { generateNFPCacheKey } from "../util";

export default class SvgNest {
  constructor() {
    this._svg = null;
    // keep a reference to any style nodes, to maintain color/fill info
    this._style = null;
    this._parts = null;
    this._tree = null;
    this._bin = null;
    this._binPolygon = null;
    this._nfpCache = new Map();
    this._configuration = {
      clipperScale: 10000000,
      curveTolerance: 0.3,
      spacing: 0,
      rotations: 4,
      populationSize: 10,
      mutationRate: 10,
      useHoles: false,
      exploreConcave: false
    };

    this._isWorking = false;
    this._genethicAlgorithm = null;
    this._best = null;
    this._workerTimer = null;
    this._progress = 0;
    this._svgParser = new SvgParser();
  }

  parseSvg(svgstring) {
    // reset if in progress
    this.stop();

    this._bin = null;
    this._binPolygon = null;
    this._tree = null;

    // parse svg
    this._svg = this._svgParser.load(svgstring);
    this._style = this._svgParser.getStyle();
    this._svg = this._svgParser.clean();
    this._tree = new TreePolygon(
      this._svgParser.svgToTreePolygon(
        this._svg.childNodes,
        this._configuration
      ),
      this._configuration,
      false
    );

    return this._svg;
  }

  setBin(element) {
    if (!this._svg) {
      return;
    }
    this._bin = element;
  }

  config(configuration) {
    // clean up inputs

    if (!configuration) {
      return this._configuration;
    }

    if (
      configuration.curveTolerance &&
      !almostEqual(parseFloat(configuration.curveTolerance), 0)
    ) {
      this._configuration.curveTolerance = parseFloat(
        configuration.curveTolerance
      );
    }

    if ("spacing" in configuration) {
      this._configuration.spacing = parseFloat(configuration.spacing);
    }

    if (configuration.rotations && parseInt(configuration.rotations) > 0) {
      this._configuration.rotations = parseInt(configuration.rotations);
    }

    if (
      configuration.populationSize &&
      parseInt(configuration.populationSize) > 2
    ) {
      this._configuration.populationSize = parseInt(
        configuration.populationSize
      );
    }

    if (
      configuration.mutationRate &&
      parseInt(configuration.mutationRate) > 0
    ) {
      this._configuration.mutationRate = parseInt(configuration.mutationRate);
    }

    if ("useHoles" in configuration) {
      this._configuration.useHoles = !!configuration.useHoles;
    }

    if ("exploreConcave" in configuration) {
      this._configuration.exploreConcave = !!configuration.exploreConcave;
    }

    this._svgParser.config({ tolerance: this._configuration.curveTolerance });

    this._best = null;
    this._nfpCache.clear();
    this._binPolygon = null;
    this._genethicAlgorithm = null;

    return this._configuration;
  }

  // progressCallback is called when progress is made
  // displayCallback is called when a new placement has been made
  start(progressCallback, displayCallback) {
    if (!this._svg || !this._bin) {
      return false;
    }

    this._parts = Array.prototype.slice.call(this._svg.childNodes);
    const binIndex = this._parts.indexOf(this._bin);

    if (binIndex >= 0) {
      // don't process bin as a part of the tree
      this._parts.splice(binIndex, 1);
    }

    // build tree without bin
    this._tree = new TreePolygon(
      this._svgParser.svgToTreePolygon(
        this._parts.slice(),
        this._configuration
      ),
      this._configuration,
      true
    );

    this._binPolygon = new BinPolygon(
      this._svgParser.svgToPolygon(this._bin, this._configuration),
      this._configuration
    );

    if (!this._binPolygon.isValid) {
      return false;
    }

    this._tree.removeDuplicats();
    this._isWorking = false;

    this._workerTimer = setInterval(() => {
      if (!this._isWorking) {
        this._launchWorkers(displayCallback);
        this._isWorking = true;
      }

      progressCallback(this._progress);
    }, 100);
  }

  stop() {
    this._isWorking = false;

    if (this._workerTimer) {
      clearInterval(this._workerTimer);
      this._workerTimer = null;
    }
  }

  _launchWorkers(displayCallback) {
    let i, j;

    if (this._genethicAlgorithm === null) {
      // initiate new GA
      const adam = this._tree.polygons;

      // seed with decreasing area
      adam.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));

      this._genethicAlgorithm = new GeneticAlgorithm(
        adam,
        this._binPolygon.polygons,
        this._configuration
      );
    }

    const individual = this._genethicAlgorithm.individual;
    const placeList = individual.placement;
    const rotations = individual.rotation;
    const placeCount = placeList.length;
    const ids = [];
    const nfpPairs = [];
    const newCache = new Map();
    let part;
    let numKey = 0;

    const updateCache = (polygon1, polygon2, rotation1, rotation2, inside) => {
      numKey = generateNFPCacheKey(
        this._configuration.rotations,
        inside,
        polygon1,
        polygon2,
        rotation1,
        rotation2
      );

      if (!this._nfpCache.has(numKey)) {
        nfpPairs.push({ A: polygon1, B: polygon2, numKey });
      } else {
        newCache.set(numKey, this._nfpCache.get(numKey));
      }
    };

    for (i = 0; i < placeCount; ++i) {
      part = placeList[i];
      ids.push(part.id);
      part.rotation = rotations[i];

      updateCache(this._binPolygon.polygons, part, 0, rotations[i], true);

      for (j = 0; j < i; ++j) {
        updateCache(placeList[j], part, rotations[j], rotations[i], false);
      }
    }

    // only keep cache for one cycle
    this._nfpCache = newCache;

    const placementWorkerData = {
      binPolygon: this._binPolygon.polygons,
      paths: placeList.slice(),
      ids,
      rotations,
      config: this._configuration,
      nfpCache: this._nfpCache
    };

    let spawnCount = 0;

    const onSpawn = () => {
      this._progress = spawnCount++ / nfpPairs.length;
    };

    const parallel = new Parallel(
      "pair",
      nfpPairs,
      {
        rotations: this._configuration.rotations,
        binPolygon: this._binPolygon.polygons,
        searchEdges: this._configuration.exploreConcave,
        useHoles: this._configuration.useHoles
      },
      onSpawn
    );

    parallel.then(
      (generatedNfp) => {
        if (generatedNfp) {
          let i = 0;
          let Nfp;

          for (i = 0; i < generatedNfp.length; ++i) {
            Nfp = generatedNfp[i];

            if (Nfp) {
              // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
              this._nfpCache.set(Nfp.numKey, Nfp.value);
            }
          }
        }

        placementWorkerData.nfpCache = this._nfpCache;

        // can't use .spawn because our data is an array
        const p2 = new Parallel(
          "placement",
          [placeList.slice()],
          placementWorkerData
        );

        p2.then(
          (placements) => {
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

            if (!this._best || bestResult.fitness < this._best.fitness) {
              this._best = bestResult;

              let placedArea = 0;
              let totalArea = 0;
              let numPlacedParts = 0;
              let bestPlacement;
              const numParts = placeList.length;

              for (i = 0; i < this._best.placements.length; ++i) {
                totalArea += Math.abs(this._binPolygon.area);
                bestPlacement = this._best.placements[i];

                numPlacedParts += bestPlacement.length;

                for (j = 0; j < bestPlacement.length; ++j) {
                  placedArea += Math.abs(
                    polygonArea(this._tree.at(bestPlacement[j].id))
                  );
                }
              }

              displayCallback(
                this._applyPlacement(),
                placedArea / totalArea,
                numPlacedParts,
                numParts
              );
            } else {
              displayCallback();
            }
            this._isWorking = false;
          },
          function (err) {
            console.log(err);
          }
        );
      },
      function (err) {
        console.log(err);
      }
    );
  }

  // returns an array of SVG elements that represent the placement, for export or rendering
  _applyPlacement() {
    const placements = this._best.placements;
    const clone = [];
    const partCount = this._parts.length;
    const placementCount = placements.length;
    const svgList = [];
    let i, j, k;
    let newSvg;
    let binClone;
    let p;
    let part;
    let partGroup;
    let flattened;
    let c;

    for (i = 0; i < partCount; ++i) {
      clone.push(this._parts[i].cloneNode(false));
    }

    const bounds = this._binPolygon.bounds;

    for (i = 0; i < placementCount; ++i) {
      newSvg = this._svg.cloneNode(false);
      newSvg.setAttribute(
        "viewBox",
        "0 0 " + bounds.width + " " + bounds.height
      );
      newSvg.setAttribute("width", bounds.width + "px");
      newSvg.setAttribute("height", bounds.height + "px");
      binClone = this._bin.cloneNode(false);

      binClone.setAttribute("class", "bin");
      binClone.setAttribute(
        "transform",
        "translate(" + -bounds.x + " " + -bounds.y + ")"
      );
      newSvg.appendChild(binClone);

      for (j = 0; j < placements[i].length; ++j) {
        p = placements[i][j];
        part = this._tree.at(p.id);

        // the original path could have transforms and stuff on it, so apply our transforms on a group
        partGroup = document.createElementNS(this._svg.namespaceURI, "g");
        partGroup.setAttribute(
          "transform",
          "translate(" + p.x + " " + p.y + ") rotate(" + p.rotation + ")"
        );
        partGroup.appendChild(clone[part.source]);

        flattened = this._tree.flat(p.id);

        if (flattened !== null) {
          for (k = 0; k < flattened.length; ++k) {
            c = clone[flattened[k].source];
            // add class to indicate hole
            if (
              flattened[k].hole &&
              (!c.getAttribute("class") ||
                c.getAttribute("class").indexOf("hole") < 0)
            ) {
              c.setAttribute("class", c.getAttribute("class") + " hole");
            }
            partGroup.appendChild(c);
          }
        }

        newSvg.appendChild(partGroup);
      }

      svgList.push(newSvg);
    }

    return svgList;
  }

  get style() {
    return this._style;
  }
}
