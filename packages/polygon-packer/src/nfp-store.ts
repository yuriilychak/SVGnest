import { nfp_generate_pair, nfp_generate_placement_data } from 'wasm-nesting';
import { NFPCache, NestConfig, THREAD_TYPE, i32, u16, u32, u8, usize, f32 } from './types';
import PolygonNode from './polygon-node';
import { serializeConfig } from './helpers';

export default class NFPStore {
    #nfpCache: NFPCache = new Map<u32, ArrayBuffer>();

    #nfpPairs: Float32Array[] = [];

    #sources: i32[] = [];

    #phenotypeSource: u16 = 0;

    #angleSplit: u8 = 0;

    #configCompressed: u32 = 0;

    static #instance: NFPStore;

    private constructor() { }

    public static get instance(): NFPStore {
        if (!NFPStore.#instance) {
            NFPStore.#instance = new NFPStore();
        }

        return NFPStore.#instance;
    }

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
        const key: u32 = PolygonNode.generateNFPCacheKey(this.#angleSplit, inside, node1, node2);

        if (!this.#nfpCache.has(key)) {
            const pairData = NFPStore.generatePair(key, node1, node2, this.#configCompressed);

            this.#nfpPairs.push(pairData);
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
        const nfpBuffer = NFPStore.serializeMapToBuffer(this.#nfpCache);
        const inputNodesArray = this.#sources.map(source => inputNodes[source]);
        const nfpData = new Uint8Array(nfpBuffer);

        return NFPStore.generatePlacementData(nfpData.slice(), this.#configCompressed, inputNodesArray, area);
    }

    public get nfpPairs(): Float32Array[] {
        return this.#nfpPairs;
    }

    public get nfpPairsCount(): usize {
        return this.#nfpPairs.length;
    }

    public get placementCount(): usize {
        return this.#sources.length;
    }

    public get phenotypeSource(): u16 {
        return this.#phenotypeSource;
    }


    public static generatePair(key: u32, node1: PolygonNode, node2: PolygonNode, config: u32): Float32Array {
        const nodes = [node1, node2];
        const serialized = PolygonNode.serialize(nodes);
        const nodesUint8 = new Float32Array(serialized);

        return nfp_generate_pair(key, config, nodesUint8);
    }

    public static generatePlacementData(nfpBuffer: Uint8Array, config: u32, inputNodes: PolygonNode[], area: f32): Uint8Array {
        const serialized = PolygonNode.serialize(inputNodes);
        const nodesFloat32 = new Float32Array(serialized);

        return nfp_generate_placement_data(nfpBuffer, config, nodesFloat32, area);
    }

    public static serializeMapToBuffer(map: NFPCache): ArrayBuffer {
        const totalSize: number = Array.from(map.values()).reduce(
            (acc, buffer) => acc + (Uint32Array.BYTES_PER_ELEMENT << 1) + buffer.byteLength,
            0
        );
        const resultBuffer: ArrayBuffer = new ArrayBuffer(totalSize);
        const view: DataView = new DataView(resultBuffer);
        const entries = Array.from(map.entries());
        let length: number = 0;

        entries.reduce((offset, [key, buffer]) => {
            view.setUint32(offset, key);
            offset += Uint32Array.BYTES_PER_ELEMENT;
            length = buffer.byteLength;
            view.setUint32(offset, length);
            offset += Uint32Array.BYTES_PER_ELEMENT;

            new Uint8Array(resultBuffer, offset).set(new Uint8Array(buffer));

            return offset + length;
        }, 0);

        return resultBuffer;
    }
}
