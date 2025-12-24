import { get_u16_from_u32 } from 'wasm-nesting';
import { GeneticAlgorithm } from './genetic-algorithm';
import NFPStore from './nfp-store';
import { BoundRectF32, NestConfig, PolygonNode } from './types';
import { readUint32FromF32 } from './helpers';
import { PolygonF32 } from './geometry';
import { generateTree, generateBounds } from './clipper-wrapper';

export default class WasmPacker {
    #geneticAlgorithm = new GeneticAlgorithm();

    #binNode: PolygonNode = null;

    #binArea: number = 0;

    #binBounds: BoundRectF32 = null;

    #resultBounds: BoundRectF32 = null;

    #best: Float32Array = null;

    #nfpStore: NFPStore = new NFPStore();

    #nodes: PolygonNode[] = [];

    #config: NestConfig = null;
    // progressCallback is called when progress is made
    // displayCallback is called when a new placement has been made
    public init(
        configuration: NestConfig,
        polygons: Float32Array[],
        binPolygon: Float32Array,
    ): void {
        const binData = generateBounds(binPolygon, configuration.spacing, configuration.curveTolerance);

        this.#binNode = binData.binNode;
        this.#binBounds = binData.bounds;
        this.#resultBounds = binData.resultBounds;
        this.#binArea = binData.area;
        this.#nodes = generateTree(polygons, configuration.spacing, configuration.curveTolerance);
        this.#config = configuration;
    }

    public getPairs(): ArrayBuffer[] {
        this.#geneticAlgorithm.init(this.#nodes, this.#resultBounds, this.#config);
        this.#nfpStore.init(this.#geneticAlgorithm.individual, this.#binNode, this.#config);

        return this.#nfpStore.nfpPairs;
    }

    public getPlacementData(generatedNfp: ArrayBuffer[]): ArrayBuffer[] {
        this.#nfpStore.update(generatedNfp);

        return this.#nfpStore.getPlacementData(this.#binArea);
    }

    public getPlacemehntResult(placements: ArrayBuffer[]) {
        if (placements.length === 0) {
            return null;
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
            const polygon: PolygonF32 = new PolygonF32();
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
                offset = get_u16_from_u32(itemData, 1);
                size = get_u16_from_u32(itemData, 0);
                placedCount += size;

                for (j = 0; j < size; ++j) {
                    pathId = get_u16_from_u32(readUint32FromF32(placementsData, offset + j), 1);
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
                angleSplit: this.#config.rotations
            };
        }

        return { result, placePerecntage, numPlacedParts, numParts };
    }

    public stop(): void {
            this.#nodes = [];
            this.#best = null;
            this.#binNode = null;
            this.#geneticAlgorithm.clean();
            this.#nfpStore.clean();
    }

    public get pairCount(): number {
        return this.#nfpStore.nfpPairs.length;
    }
}
