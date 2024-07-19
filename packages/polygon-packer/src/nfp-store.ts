import { Phenotype } from './genetic-algorithm';
import { IPolygon, NestConfig, NFPData, NFPPair, PlacementWorkerData } from './types';

export default class NFPStore {
    #nfpCache: Map<string, NFPPair> = new Map<string, NFPPair>();

    #nfpPairs: NFPPair[] = [];

    #ids: number[] = [];

    #individual: Phenotype = null;

    public init(individual: Phenotype, binPolygon: IPolygon): void {
        this.#individual = individual;
        this.#nfpPairs = [];
        this.#ids = [];

        const placeList: IPolygon[] = this.#individual.placement;
        const rotations: number[] = this.#individual.rotation;
        const placeCount: number = placeList.length;
        const newCache: Map<string, NFPPair> = new Map<string, NFPPair>();
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

    private update(generatedNfp: NFPData[]): void {
        if (generatedNfp) {
            const nfpCount: number = generatedNfp.length;
            let i: number = 0;
            let nfp: NFPData = null;
            let key = '';

            for (i = 0; i < nfpCount; ++i) {
                nfp = generatedNfp[i];

                if (nfp) {
                    // a null nfp means the nfp could not be generated, either because the parts simply don't
                    // fit or an error in the nfp algo
                    key = JSON.stringify(nfp.key);
                    this.#nfpCache.set(key, nfp.value);
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
        newCache: Map<string, NFPPair>
    ): void {
        const key = {
            A: polygon1.id,
            B: polygon2.id,
            inside,
            Arotation: rotation1,
            Brotation: rotation2
        };

        const stringKey = JSON.stringify(key);

        if (!this.#nfpCache.has(stringKey)) {
            this.#nfpPairs.push({ A: polygon1, B: polygon2, key });
        } else {
            newCache.set(stringKey, this.#nfpCache.get(stringKey));
        }
    }

    public clean(): void {
        this.#nfpCache.clear();
        this.#nfpPairs = [];
        this.#ids = [];
        this.#individual = null;
    }

    public getPlacementWorkerData(generatedNfp: NFPData[], config: NestConfig, binPolygon: IPolygon): PlacementWorkerData {
        this.update(generatedNfp);

        return {
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
