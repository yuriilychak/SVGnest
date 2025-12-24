import { rotate_polygon_wasm } from 'wasm-nesting';
import { NFPCache, PolygonNode, NestConfig, THREAD_TYPE, i32, u16, u32, u8, usize, f32 } from './types';
import { serializeMapToBuffer, serializePolygonNodes, serializeConfig, generateNFPCacheKey } from './helpers';

export default class NFPStore {
    #nfpCache: NFPCache = new Map<u32, ArrayBuffer>();

    #nfpPairs: ArrayBuffer[] = [];

    #sources: i32[] = [];

    #phenotypeSource: u16 = 0;

    #angleSplit: u8 = 0;

    #configCompressed: u32 = 0;

    public init(nodes: PolygonNode[], binNode: PolygonNode, config: NestConfig, phenotypeSource: u16, sources: i32[], rotations: u16[]): void {
        this.#configCompressed = serializeConfig(config);
        this.#phenotypeSource = phenotypeSource;
        this.#sources = sources.slice();
        this.#angleSplit = config.rotations;
        this.#nfpPairs = [];

        const newCache: NFPCache = new Map<u32, ArrayBuffer>();

        for (let i = 0; i < this.#sources.length; ++i) {
            const node = nodes[this.#sources[i]];
            node.rotation = rotations[i];

            this.updateCache(binNode, node, true, newCache);

            for (let j = 0; j < i; ++j) {
                this.updateCache(nodes[sources[j]], node, false, newCache);
            }
        }

        // only keep cache for one cycle
        this.#nfpCache = newCache;
    }

    public update(nfps: ArrayBuffer[]): void {
        const nfpCount: usize = nfps.length;

        if (nfpCount !== 0) {
            let view: DataView;

            for (let i = 0; i < nfpCount; ++i) {
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
        const key: u32 = generateNFPCacheKey(this.#angleSplit, inside, node1, node2);

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
        this.#sources = [];
        this.#phenotypeSource = 0;
        this.#angleSplit = 0;
        this.#configCompressed = 0;
    }

    public getPlacementData(inputNodes: PolygonNode[], area: f32): Uint8Array {
        const nfpBuffer = serializeMapToBuffer(this.#nfpCache);
        const bufferSize = nfpBuffer.byteLength;
        const nodes = NFPStore.rotateNodes(this.#sources.map(source => inputNodes[source]));
        const buffer = serializePolygonNodes(nodes, Uint32Array.BYTES_PER_ELEMENT * 4 + bufferSize);
        const view = new DataView(buffer);

        view.setUint32(0, THREAD_TYPE.PLACEMENT);
        view.setUint32(Uint32Array.BYTES_PER_ELEMENT, this.#configCompressed);
        view.setFloat32(Uint32Array.BYTES_PER_ELEMENT * 2, area);
        view.setUint32(Uint32Array.BYTES_PER_ELEMENT * 3, bufferSize);

        new Uint8Array(buffer, Uint32Array.BYTES_PER_ELEMENT * 4).set(new Uint8Array(nfpBuffer));

        return new Uint8Array(buffer);
    }

    public get nfpPairs(): ArrayBuffer[] {
        return this.#nfpPairs;
    }

    public get placementCount(): usize {
        return this.#sources.length;
    }

    public get phenotypeSource(): u16 {
        return this.#phenotypeSource;
    }

    private static rotateNodes(nodes: PolygonNode[]): PolygonNode[] {
        const result: PolygonNode[] = NFPStore.cloneNodes(nodes);

        const nodeCount: usize = result.length;

        for (let i = 0; i < nodeCount; ++i) {
            NFPStore.rotateNode(result[i], result[i].rotation);
        }

        return result;
    }

    private static rotateNode(rootNode: PolygonNode, rotation: u16): void {
        rootNode.memSeg = rotate_polygon_wasm(rootNode.memSeg, rotation);

        const childCount: usize = rootNode.children.length;

        for (let i = 0; i < childCount; ++i) {
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
