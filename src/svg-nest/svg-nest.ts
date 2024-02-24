/*!
 * SvgNest
 * Licensed under the MIT license
 */

import { GeneticAlgorithm } from "../genetic-algorithm";
import { SvgParser } from "../svg-parser";
import { Parallel } from "../parallel";
import { polygonArea } from "../geometry-util";
import { almostEqual } from "../util";
import { TreePolygon, BinPolygon } from "./polygon";
import { generateNFPCacheKey } from "../util";
import {
  ArrayPolygon,
  NfpPair,
  PairDataResult,
  PlaceDataResult,
  Point,
  SvgNestConfiguration
} from "../interfaces";
import Phenotype from "../genetic-algorithm/phenotype";

export default class SvgNest {
  private _best: PlaceDataResult = null;
  private _bin: Element = null;
  private _svg: SVGElement = null;
  private _style: SVGElement = null;
  private _isWorking: boolean = false;
  private _parts: ChildNode[];
  private _genethicAlgorithm: GeneticAlgorithm;
  private _progress: number = 0;
  private _svgParser: SvgParser;
  private _configuration: SvgNestConfiguration;
  private _tree: TreePolygon = null;
  private _binPolygon: BinPolygon = null;
  private _nfpCache: Map<number, ArrayPolygon[]>;
  private _workerTimer: NodeJS.Timeout = null;

  constructor() {
    // keep a reference to any style nodes, to maintain color/fill info
    this._parts = [];
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
    this._genethicAlgorithm = new GeneticAlgorithm();
    this._svgParser = new SvgParser();
  }

  public parseSvg(svgString: string): Element {
    // reset if in progress
    this.stop();

    this._bin = null;
    this._binPolygon = null;
    this._tree = null;

    // parse svg
    this._svg = this._svgParser.load(svgString);
    this._style = this._svgParser.getStyle();
    this._svg = this._svgParser.clean();
    this._tree = new TreePolygon(
      this._svgParser.svgToTreePolygon(
        Array.prototype.slice.call(this._svg.childNodes),
        this._configuration
      ),
      this._configuration,
      false
    );

    return this._svg;
  }

  public setBin(element: Element): void {
    if (!this._svg) {
      return;
    }
    this._bin = element;
  }

  public config(configuration: {
    [key: string]: string;
  }): SvgNestConfiguration {
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

    this._svgParser.config({
      tolerance: this._configuration.curveTolerance,
      toleranceSvg: 0.005
    });

    this._best = null;
    this._nfpCache.clear();
    this._binPolygon = null;
    this._genethicAlgorithm.clear();

    return this._configuration;
  }

  // progressCallback is called when progress is made
  // displayCallback is called when a new placement has been made
  start(progressCallback: Function, displayCallback: Function): boolean {
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

  public stop(): void {
    this._isWorking = false;

    if (this._workerTimer) {
      clearInterval(this._workerTimer);
      this._workerTimer = null;
    }
  }

  private _launchWorkers(displayCallback: Function): void {
    let i: number = 0;
    let j: number = 0;

    if (this._genethicAlgorithm.isEmpty) {
      // initiate new GA
      const adam: ArrayPolygon[] = this._tree.polygons;

      // seed with decreasing area
      adam.sort(
        (a: ArrayPolygon, b: ArrayPolygon): number =>
          Math.abs(polygonArea(b)) - Math.abs(polygonArea(a))
      );

      this._genethicAlgorithm.init(
        adam,
        this._binPolygon.bounds,
        this._configuration
      );
    }

    const individual: Phenotype = this._genethicAlgorithm.individual;
    const placeList: ArrayPolygon[] = individual.placement;
    const rotations: number[] = individual.rotation;
    const placeCount: number = placeList.length;
    const ids: number[] = [];
    const nfpPairs: NfpPair[] = [];
    const newCache: Map<number, ArrayPolygon[]> = new Map();
    let part: ArrayPolygon;
    let numKey: number = 0;

    const updateCache = (
      polygon1: ArrayPolygon,
      polygon2: ArrayPolygon,
      rotation1: number,
      rotation2: number,
      inside: boolean
    ) => {
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

    let spawnCount: number = 0;

    const onSpawn = () => {
      this._progress = spawnCount++ / nfpPairs.length;
    };

    const parallel: Parallel = new Parallel(
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

    parallel.then<PairDataResult>(
      (generatedNfp: PairDataResult[]) => {
        if (generatedNfp) {
          let i: number = 0;
          let nfp: PairDataResult;

          for (i = 0; i < generatedNfp.length; ++i) {
            nfp = generatedNfp[i];

            if (nfp) {
              // a null nfp means the nfp could not be generated, either because the parts simply don't fit or an error in the nfp algo
              this._nfpCache.set(nfp.numKey, nfp.value);
            }
          }
        }

        placementWorkerData.nfpCache = this._nfpCache;

        // can't use .spawn because our data is an array
        const p2: Parallel = new Parallel(
          "placement",
          [placeList.slice()],
          placementWorkerData
        );

        p2.then<PlaceDataResult>(
          (placements: PlaceDataResult[]) => {
            if (!placements || placements.length == 0) {
              return;
            }

            let i: number = 0;
            let j: number = 0;
            let bestResult = placements[0];

            individual.fitness = bestResult.fitness;

            for (i = 1; i < placements.length; ++i) {
              if (placements[i].fitness < bestResult.fitness) {
                bestResult = placements[i];
              }
            }

            if (!this._best || bestResult.fitness < this._best.fitness) {
              this._best = bestResult;

              let placedArea: number = 0;
              let totalArea: number = 0;
              let numPlacedParts: number = 0;
              let bestPlacement: Point[];
              const numParts: number = placeList.length;
              const binArea: number = Math.abs(this._binPolygon.area);

              for (i = 0; i < this._best.placements.length; ++i) {
                totalArea += binArea;
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
  private _applyPlacement() {
    const placements: Point[][] = this._best.placements;
    const clone: Node[] = [];
    const partCount: number = this._parts.length;
    const placementCount: number = placements.length;
    const svgList = [];
    let i: number = 0;
    let j: number = 0;
    let k: number = 0;
    let newSvg: Element;
    let binClone: Element;
    let point: Point;
    let part: ArrayPolygon;
    let partGroup: Element;
    let flattened;
    let c: Element;

    for (i = 0; i < partCount; ++i) {
      clone.push(this._parts[i].cloneNode(false));
    }

    const bounds = this._binPolygon.bounds;

    for (i = 0; i < placementCount; ++i) {
      newSvg = this._svg.cloneNode(false) as Element;
      newSvg.setAttribute(
        "viewBox",
        "0 0 " + bounds.width + " " + bounds.height
      );
      newSvg.setAttribute("width", bounds.width + "px");
      newSvg.setAttribute("height", bounds.height + "px");
      binClone = this._bin.cloneNode(false) as Element;

      binClone.setAttribute("class", "bin");
      binClone.setAttribute(
        "transform",
        "translate(" + -bounds.x + " " + -bounds.y + ")"
      );
      newSvg.appendChild(binClone);

      for (j = 0; j < placements[i].length; ++j) {
        point = placements[i][j];
        part = this._tree.at(point.id);

        // the original path could have transforms and stuff on it, so apply our transforms on a group
        partGroup = document.createElementNS(this._svg.namespaceURI, "g");
        partGroup.setAttribute(
          "transform",
          "translate(" +
            point.x +
            " " +
            point.y +
            ") rotate(" +
            point.rotation +
            ")"
        );
        partGroup.appendChild(clone[part.source]);

        flattened = this._tree.flat(point.id);

        if (flattened !== null) {
          for (k = 0; k < flattened.length; ++k) {
            c = clone[flattened[k].source] as Element;
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

  get style(): SVGElement {
    return this._style;
  }
}
