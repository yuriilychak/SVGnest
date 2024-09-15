import { generateNFPCacheKey } from 'geometry-utils';

import { Phenotype } from './genetic-algorithm';
import { IPolygon, NestConfig, NFPPair, PlacementWorkerData, NFPCache } from './types';

export default class NFPStore {
    #nfpCache: NFPCache = new Map<number, Float64Array>();

    #nfpPairs: NFPPair[] = [];

    #ids: number[] = [];

    #individual: Phenotype = null;

    #angleSplit: number = 0;

    public init(individual: Phenotype, binPolygon: IPolygon, angleSplit: number): void {
        this.#individual = individual;
        this.#angleSplit = angleSplit;
        this.#nfpPairs = [];
        this.#ids = [];

        const placeList: IPolygon[] = this.#individual.placement;
        const rotations: number[] = this.#individual.rotation;
        const placeCount: number = placeList.length;
        const newCache: NFPCache = new Map<number, Float64Array>();
        let part = null;
        let i: number = 0;
        let j: number = 0;

        for (i = 0; i < placeCount; ++i) {
            part = placeList[i];
            this.#ids.push(part.id);
            part.rotation = rotations[i];

            this.updateCache(binPolygon, part, 0, rotations[i], true, newCache);

            for (j = 0; j < i; ++j) {
                this.updateCache(placeList[j], part, rotations[j], rotations[i], false, newCache);
            }
        }

        // only keep cache for one cycle
        this.#nfpCache = newCache;
    }

    private update(generatedNfp: ArrayBuffer[]): void {
        if (generatedNfp) {
            const nfpCount: number = generatedNfp.length;
            let i: number = 0;
            let nfp: Float64Array = null;

            for (i = 0; i < nfpCount; ++i) {
                nfp = new Float64Array(generatedNfp[i]);

                if (nfp.length > 2) {
                    // a null nfp means the nfp could not be generated, either because the parts simply don't
                    // fit or an error in the nfp algo
                    this.#nfpCache.set(nfp[0], nfp);
                }
            }
        }
    }

    private updateCache(
        polygon1: IPolygon,
        polygon2: IPolygon,
        rotation1: number,
        rotation2: number,
        inside: boolean,
        newCache: NFPCache
    ): void {
        const key: number = generateNFPCacheKey(this.#angleSplit, inside, polygon1, polygon2, rotation1, rotation2);

        if (!this.#nfpCache.has(key)) {
            this.#nfpPairs.push({ A: polygon1, B: polygon2, key });
        } else {
            newCache.set(key, this.#nfpCache.get(key));
        }
    }

    public clean(): void {
        this.#nfpCache.clear();
        this.#nfpPairs = [];
        this.#ids = [];
        this.#individual = null;
    }

    public getPlacementWorkerData(generatedNfp: ArrayBuffer[], config: NestConfig, binPolygon: IPolygon): PlacementWorkerData {
        this.update(generatedNfp);

        return {
            angleSplit: this.#angleSplit,
            binPolygon,
            paths: this.clonePlacement(),
            ids: this.#ids,
            rotations: this.#individual.rotation,
            config,
            nfpCache: this.#nfpCache
        };
    }

    public clonePlacement(): IPolygon[] {
        return this.#individual.placement.slice();
    }

    public get nfpPairs(): NFPPair[] {
        return this.#nfpPairs;
    }

    public get placementCount(): number {
        return this.#individual.placement.length;
    }

    public get fitness(): number {
        return this.#individual.fitness;
    }

    public set fitness(value: number) {
        this.#individual.fitness = value;
    }
}
