import { generateNFPCacheKey, Polygon, serializeConfig, serializeMapToBuffer, serializePolygonNodes } from 'geometry-utils';

import { Phenotype } from './genetic-algorithm';
import { NFPCache, PolygonNode, NestConfig, THREAD_TYPE } from './types';

export default class NFPStore {
    #nfpCache: NFPCache = new Map<number, ArrayBuffer>();

    #nfpPairs: ArrayBuffer[] = [];

    #individual: Phenotype = null;

    #angleSplit: number = 0;

    #configCompressed: number = 0;

    public init(individual: Phenotype, binNode: PolygonNode, config: NestConfig): void {
        this.#configCompressed = serializeConfig(config);
        this.#individual = individual;
        this.#angleSplit = config.rotations;
        this.#nfpPairs = [];

        const polygon: Polygon = Polygon.create();
        const nodes: PolygonNode[] = this.#individual.placement;
        const rotations: number[] = this.#individual.rotation;
        const placeCount: number = nodes.length;
        const newCache: NFPCache = new Map<number, ArrayBuffer>();
        let node: PolygonNode = null;
        let i: number = 0;
        let j: number = 0;

        for (i = 0; i < placeCount; ++i) {
            node = nodes[i];
            node.rotation = rotations[i];

            this.updateCache(polygon, binNode, node, true, newCache);

            for (j = 0; j < i; ++j) {
                this.updateCache(polygon, nodes[j], node, false, newCache);
            }
        }

        // only keep cache for one cycle
        this.#nfpCache = newCache;
    }

    public update(nfps: ArrayBuffer[]): void {
        const nfpCount: number = nfps.length;

        if (nfpCount !== 0) {
            let i: number = 0;
            let view: DataView = null;

            for (i = 0; i < nfpCount; ++i) {
                view = new DataView(nfps[i]);

                if (nfps[i].byteLength > Float64Array.BYTES_PER_ELEMENT << 1) {
                    // a null nfp means the nfp could not be generated, either because the parts simply don't
                    // fit or an error in the nfp algo
                    this.#nfpCache.set(view.getFloat64(0, true), nfps[i]);
                }
            }
        }
    }

    private updateCache(polygon: Polygon, node1: PolygonNode, node2: PolygonNode, inside: boolean, newCache: NFPCache): void {
        const key: number = generateNFPCacheKey(this.#angleSplit, inside, node1, node2);

        if (!this.#nfpCache.has(key)) {
            const nodes = NFPStore.rotateNodes(polygon, [node1, node2]);
            const buffer = serializePolygonNodes(nodes, Float64Array.BYTES_PER_ELEMENT * 3);
            const view: DataView = new DataView(buffer);

            view.setFloat64(0, THREAD_TYPE.PAIR);
            view.setFloat64(Float64Array.BYTES_PER_ELEMENT, key);
            view.setFloat64(Float64Array.BYTES_PER_ELEMENT << 1, this.#configCompressed);

            this.#nfpPairs.push(buffer);
        } else {
            newCache.set(key, this.#nfpCache.get(key));
        }
    }

    public clean(): void {
        this.#nfpCache.clear();
        this.#nfpPairs = [];
        this.#individual = null;
    }

    public getPlacementData(area: number): ArrayBuffer[] {
        const polygon: Polygon = Polygon.create();
        const nfpBuffer = serializeMapToBuffer(this.#nfpCache);
        const bufferSize = nfpBuffer.byteLength;
        const nodes = NFPStore.rotateNodes(polygon, this.#individual.placement);
        const buffer = serializePolygonNodes(nodes, Float64Array.BYTES_PER_ELEMENT * 4 + bufferSize);
        const view = new DataView(buffer);

        view.setFloat64(0, THREAD_TYPE.PLACEMENT);
        view.setFloat64(Float64Array.BYTES_PER_ELEMENT, this.#configCompressed);
        view.setFloat64(Float64Array.BYTES_PER_ELEMENT * 2, area);
        view.setFloat64(Float64Array.BYTES_PER_ELEMENT * 3, bufferSize);

        new Uint8Array(buffer, Float64Array.BYTES_PER_ELEMENT * 4).set(new Uint8Array(nfpBuffer));

        return [buffer];
    }

    public get nfpPairs(): ArrayBuffer[] {
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

    private static rotateNodes(polygon: Polygon, nodes: PolygonNode[]): PolygonNode[] {
        const result: PolygonNode[] = NFPStore.cloneNodes(nodes);

        const nodeCount: number = result.length;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            NFPStore.rotateNode(polygon, result[i], result[i].rotation);
        }

        return result;
    }

    private static rotateNode(polygon: Polygon, rootNode: PolygonNode, rotation: number): void {
        polygon.bind(rootNode.memSeg);
        polygon.rotate(rotation);

        const childCount: number = rootNode.children.length;
        let i: number = 0;

        for (i = 0; i < childCount; ++i) {
            NFPStore.rotateNode(polygon, rootNode.children[i], rotation);
        }
    }

    private static cloneNodes(nodes: PolygonNode[]): PolygonNode[] {
        const result: PolygonNode[] = [];
        const nodeCount: number = nodes.length;
        let node: PolygonNode = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            node = nodes[i];

            result.push({
                ...node,
                memSeg: node.memSeg.slice(),
                children: NFPStore.cloneNodes(node.children)
            });
        }

        return result;
    }
}
