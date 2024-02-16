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

function getPlacementWorkerData(
  binPolygon,
  paths,
  ids,
  rotations,
  config,
  nfpCache = {}
) {
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
  constructor() {
    this.svg = null;
    // keep a reference to any style nodes, to maintain color/fill info
    this.style = null;
    this.parts = null;
    this.tree = null;
    this.bin = null;
    this.binPolygon = null;
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

    this.genethicAlgorithm = null;
    this.best = null;
    this.workerTimer = null;
    this.progress = 0;
    this.svgParser = new SvgParser();
  }

  parseSvg(svgstring) {
    // reset if in progress
    this.stop();

    this.bin = null;
    this.binPolygon = null;
    this.tree = null;

    // parse svg
    this.svg = this.svgParser.load(svgstring);
    this.style = this.svgParser.getStyle();
    this.svg = this.svgParser.clean();
    this.tree = new TreePolygon(
      this.svgParser.svgToTreePolygon(
        this.svg.childNodes,
        this.configuration.curveTolerance,
        this.configuration.clipperScale
      ),
      this.configuration,
      false
    );

    return this.svg;
  }

  setBin(element) {
    if (!this.svg) {
      return;
    }
    this.bin = element;
  }

  config(configuration) {
    // clean up inputs

    if (!configuration) {
      return this.configuration;
    }

    if (
      configuration.curveTolerance &&
      !almostEqual(parseFloat(configuration.curveTolerance), 0)
    ) {
      this.configuration.curveTolerance = parseFloat(
        configuration.curveTolerance
      );
    }

    if ("spacing" in configuration) {
      this.configuration.spacing = parseFloat(configuration.spacing);
    }

    if (configuration.rotations && parseInt(configuration.rotations) > 0) {
      this.configuration.rotations = parseInt(configuration.rotations);
    }

    if (
      configuration.populationSize &&
      parseInt(configuration.populationSize) > 2
    ) {
      this.configuration.populationSize = parseInt(
        configuration.populationSize
      );
    }

    if (
      configuration.mutationRate &&
      parseInt(configuration.mutationRate) > 0
    ) {
      this.configuration.mutationRate = parseInt(configuration.mutationRate);
    }

    if ("useHoles" in configuration) {
      this.configuration.useHoles = !!configuration.useHoles;
    }

    if ("exploreConcave" in configuration) {
      this.configuration.exploreConcave = !!configuration.exploreConcave;
    }

    this.svgParser.config({ tolerance: this.configuration.curveTolerance });

    this.best = null;
    this.nfpCache = {};
    this.binPolygon = null;
    this.genethicAlgorithm = null;

    return this.configuration;
  }

  // progressCallback is called when progress is made
  // displayCallback is called when a new placement has been made
  start(progressCallback, displayCallback) {
    if (!this.svg || !this.bin) {
      return false;
    }

    this.parts = Array.prototype.slice.call(this.svg.childNodes);
    const binIndex = this.parts.indexOf(this.bin);

    if (binIndex >= 0) {
      // don't process bin as a part of the tree
      this.parts.splice(binIndex, 1);
    }

    // build tree without bin
    this.tree = new TreePolygon(
      this.svgParser.svgToTreePolygon(
        this.parts.slice(),
        this.configuration.curveTolerance,
        this.configuration.clipperScale
      ),
      this.configuration,
      true
    );

    this.binPolygon = new BinPolygon(
      this.svgParser.svgToPolygon(
        this.bin,
        this.configuration.curveTolerance,
        this.configuration.clipperScale
      ),
      this.configuration
    );

    if (!this.binPolygon.isValid) {
      return false;
    }

    this.tree.removeDuplicats();
    this.working = false;

    this.workerTimer = setInterval(() => {
      if (!this.working) {
        this._launchWorkers(displayCallback);
        this.working = true;
      }

      progressCallback(this.progress);
    }, 100);
  }

  stop() {
    this.working = false;

    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  _launchWorkers(displayCallback) {
    let i, j;

    if (this.genethicAlgorithm === null) {
      // initiate new GA
      const adam = this.tree.polygons;

      // seed with decreasing area
      adam.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));

      this.genethicAlgorithm = new GeneticAlgorithm(
        adam,
        this.binPolygon.polygons,
        this.configuration
      );
    }

    const individual = this.genethicAlgorithm.individual;
    const placeList = individual.placement;
    const rotations = individual.rotation;
    const placeCount = placeList.length;
    const ids = [];
    const nfpPairs = [];
    const newCache = {};
    let key;
    let part;
    let numKey = 0;

    const updateCache = (polygon1, polygon2, rotation1, rotation2, inside) => {
      key = {
        A: polygon1.id,
        B: polygon2.id,
        inside,
        Arotation: rotation1,
        Brotation: rotation2
      };

      numKey = generateNFPCacheKey(
        polygon1.id,
        polygon2.id,
        rotation1,
        rotation2,
        inside,
        this.configuration.rotations
      );

      if (!this.nfpCache[numKey]) {
        nfpPairs.push({ A: polygon1, B: polygon2, key, numKey });
      } else {
        newCache[numKey] = this.nfpCache[numKey];
      }
    };

    for (i = 0; i < placeCount; ++i) {
      part = placeList[i];
      ids.push(part.id);
      part.rotation = rotations[i];

      updateCache(this.binPolygon.polygons, part, 0, rotations[i], true);

      for (j = 0; j < i; ++j) {
        updateCache(placeList[j], part, rotations[j], rotations[i], false);
      }
    }

    // only keep cache for one cycle
    this.nfpCache = newCache;

    const placementWorkerData = getPlacementWorkerData(
      this.binPolygon.polygons,
      placeList.slice(0),
      ids,
      rotations,
      this.configuration,
      this.nfpCache
    );

    let spawnCount = 0;

    const onSpawn = () => {
      this.progress = spawnCount++ / nfpPairs.length;
    };

    const parallel = new Parallel(
      "pair",
      nfpPairs,
      {
        binPolygon: this.binPolygon.polygons,
        searchEdges: this.configuration.exploreConcave,
        useHoles: this.configuration.useHoles
      },
      onSpawn
    );

    parallel.then(
      (generatedNfp) => {
        if (generatedNfp) {
          let i = 0;
          let Nfp;
          let key;

          for (i = 0; i < generatedNfp.length; ++i) {
            Nfp = generatedNfp[i];

            if (Nfp) {
              // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
              key = Nfp.numKey;
              this.nfpCache[key] = Nfp.value;
            }
          }
        }

        placementWorkerData.nfpCache = this.nfpCache;

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

            if (!this.best || bestResult.fitness < this.best.fitness) {
              this.best = bestResult;

              let placedArea = 0;
              let totalArea = 0;
              let numPlacedParts = 0;
              let bestPlacement;
              const numParts = placeList.length;

              for (i = 0; i < this.best.placements.length; ++i) {
                totalArea += Math.abs(this.binPolygon.area);
                bestPlacement = this.best.placements[i];

                numPlacedParts += bestPlacement.length;

                for (j = 0; j < bestPlacement.length; ++j) {
                  placedArea += Math.abs(
                    polygonArea(this.tree.at(bestPlacement[j].id))
                  );
                }
              }

              displayCallback(
                this._applyPlacement(this.best.placements),
                placedArea / totalArea,
                numPlacedParts,
                numParts
              );
            } else {
              displayCallback();
            }
            this.working = false;
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
  _applyPlacement(placement) {
    const clone = [];
    const partCount = this.parts.length;
    const placementCount = placement.length;
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
      clone.push(this.parts[i].cloneNode(false));
    }

    const bounds = this.binPolygon.bounds;

    for (i = 0; i < placementCount; ++i) {
      newSvg = this.svg.cloneNode(false);
      newSvg.setAttribute(
        "viewBox",
        "0 0 " + bounds.width + " " + bounds.height
      );
      newSvg.setAttribute("width", bounds.width + "px");
      newSvg.setAttribute("height", bounds.height + "px");
      binClone = this.bin.cloneNode(false);

      binClone.setAttribute("class", "bin");
      binClone.setAttribute(
        "transform",
        "translate(" + -bounds.x + " " + -bounds.y + ")"
      );
      newSvg.appendChild(binClone);

      for (j = 0; j < placement[i].length; ++j) {
        p = placement[i][j];
        part = this.tree.at(p.id);

        // the original path could have transforms and stuff on it, so apply our transforms on a group
        partGroup = document.createElementNS(this.svg.namespaceURI, "g");
        partGroup.setAttribute(
          "transform",
          "translate(" + p.x + " " + p.y + ") rotate(" + p.rotation + ")"
        );
        partGroup.appendChild(clone[part.source]);

        flattened = this.tree.flat(p.id);

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

  _svgToTreePolygon(paths) {
    let i;
    const result = [];
    const numChildren = paths.length;
    const trashold =
      this.configuration.curveTolerance * this.configuration.curveTolerance;
    let poly;

    for (i = 0; i < numChildren; ++i) {
      poly = this._cleanPolygon(this.svgParser.polygonify(paths[i]));

      // todo: warn user if poly could not be processed and is excluded from the nest
      if (poly && poly.length > 2 && Math.abs(polygonArea(poly)) > trashold) {
        poly.source = i;
        result.push(poly);
      }
    }

    return result;
  }
}
