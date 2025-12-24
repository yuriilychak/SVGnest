import { rotate_polygon_wasm } from 'wasm-nesting';
import { Phenotype } from './genetic-algorithm';
import { NFPCache, PolygonNode, NestConfig, THREAD_TYPE } from './types';
import { serializeMapToBuffer, serializePolygonNodes, serializeConfig, generateNFPCacheKey } from './helpers';

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

            this.updateCache(binNode, node, true, newCache);

            for (j = 0; j < i; ++j) {
                this.updateCache(nodes[j], node, false, newCache);
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
                    this.#nfpCache.set(view.getUint32(0, true), nfps[i]);
                }
            }
        }
    }

    private updateCache(node1: PolygonNode, node2: PolygonNode, inside: boolean, newCache: NFPCache): void {
        const key: number = generateNFPCacheKey(this.#angleSplit, inside, node1, node2);

        if (!this.#nfpCache.has(key)) {
            const nodes = NFPStore.rotateNodes([node1, node2]);
            const buffer = serializePolygonNodes(nodes, Uint32Array.BYTES_PER_ELEMENT * 3);
            const view: DataView = new DataView(buffer);

            view.setUint32(0, THREAD_TYPE.PAIR);
            view.setUint32(Uint32Array.BYTES_PER_ELEMENT, this.#configCompressed);
            view.setUint32(Uint32Array.BYTES_PER_ELEMENT << 1, key);

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
        const nfpBuffer = serializeMapToBuffer(this.#nfpCache);
        const bufferSize = nfpBuffer.byteLength;
        const nodes = NFPStore.rotateNodes(this.#individual.placement);
        const buffer = serializePolygonNodes(nodes, Uint32Array.BYTES_PER_ELEMENT * 4 + bufferSize);
        const view = new DataView(buffer);

        view.setUint32(0, THREAD_TYPE.PLACEMENT);
        view.setUint32(Uint32Array.BYTES_PER_ELEMENT, this.#configCompressed);
        view.setFloat32(Uint32Array.BYTES_PER_ELEMENT * 2, area);
        view.setUint32(Uint32Array.BYTES_PER_ELEMENT * 3, bufferSize);

        new Uint8Array(buffer, Uint32Array.BYTES_PER_ELEMENT * 4).set(new Uint8Array(nfpBuffer));

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

    private static rotateNodes(nodes: PolygonNode[]): PolygonNode[] {
        const result: PolygonNode[] = NFPStore.cloneNodes(nodes);

        const nodeCount: number = result.length;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            NFPStore.rotateNode(result[i], result[i].rotation);
        }

        return result;
    }

    private static rotateNode(rootNode: PolygonNode, rotation: number): void {
        rootNode.memSeg = rotate_polygon_wasm(rootNode.memSeg, rotation);

        const childCount: number = rootNode.children.length;
        let i: number = 0;

        for (i = 0; i < childCount; ++i) {
            NFPStore.rotateNode(rootNode.children[i], rotation);
        }
    }

    private static cloneNodes(nodes: PolygonNode[]): PolygonNode[] {
        const result: PolygonNode[] = [];
        
        for (let i = 0; i < nodes.length; ++i) {
            const node = nodes[i];

            result.push({
                ...node,
                memSeg: node.memSeg.slice(),
                children: NFPStore.cloneNodes(node.children)
            });
        }

        return result;
    }
}
