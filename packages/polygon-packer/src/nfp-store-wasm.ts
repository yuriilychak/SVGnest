import {
    nfp_store_init,
    nfp_store_update,
    nfp_store_clean,
    nfp_store_get_placement_data,
    nfp_store_get_nfp_pairs,
    nfp_store_get_nfp_pairs_count,
    nfp_store_get_placement_count,
    nfp_store_get_phenotype_source
} from 'wasm-nesting';
import { NestConfig, i32, u16, f32, usize } from './types';
import { serializeConfig } from './helpers';
import PolygonNode from './polygon-node';

export default class NFPStore {
    static #instance: NFPStore;

    private constructor() { }

    public static get instance(): NFPStore {
        if (!NFPStore.#instance) {
            NFPStore.#instance = new NFPStore();
        }

        return NFPStore.#instance;
    }

    public init(
        nodes: PolygonNode[],
        binNode: PolygonNode,
        config: NestConfig,
        phenotypeSource: u16,
        sources: i32[],
        rotations: u16[]
    ): void {
        // Combine all nodes + binNode
        const allNodes = [...nodes, binNode];
        const serializedNodes = PolygonNode.serialize(allNodes);
        const nodesFloat32 = new Float32Array(serializedNodes);

        // Serialize config
        const configSerialized = serializeConfig(config);

        // Convert arrays to typed arrays
        const sourcesArray = new Int32Array(sources);
        const rotationsArray = new Uint16Array(rotations);

        // Call WASM
        nfp_store_init(nodesFloat32, configSerialized, phenotypeSource, sourcesArray, rotationsArray);
    }

    public update(nfps: ArrayBuffer[]): void {
        if (nfps.length === 0) {
            return;
        }

        // Serialize NFPs: count (u32) + [size (u32) + data]...
        let totalSize = 4; // count
        for (const nfp of nfps) {
            totalSize += 4 + nfp.byteLength; // size + data
        }

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Write count
        view.setUint32(offset, nfps.length, true);
        offset += 4;

        // Write each NFP
        for (const nfp of nfps) {
            view.setUint32(offset, nfp.byteLength, true);
            offset += 4;

            new Uint8Array(buffer, offset, nfp.byteLength).set(new Uint8Array(nfp));
            offset += nfp.byteLength;
        }

        // Call WASM
        nfp_store_update(new Uint8Array(buffer));
    }

    public clean(): void {
        nfp_store_clean();
    }

    public getPlacementData(inputNodes: PolygonNode[], area: f32): Uint8Array {
        // Serialize nodes
        const serializedNodes = PolygonNode.serialize(inputNodes);
        const nodesFloat32 = new Float32Array(serializedNodes);

        // Call WASM
        return nfp_store_get_placement_data(nodesFloat32, area);
    }

    public get nfpPairs(): Float32Array[] {
        const serialized = nfp_store_get_nfp_pairs();

        // Deserialize: count (f32) + [size (f32) + data]...
        let offset = 0;

        const countBits = new Uint32Array(Float32Array.from([serialized[offset]]).buffer)[0];
        offset += 1;

        const result: Float32Array[] = [];

        for (let i = 0; i < countBits; i++) {
            const sizeBits = new Uint32Array(Float32Array.from([serialized[offset]]).buffer)[0];
            offset += 1;

            const pair = serialized.slice(offset, offset + sizeBits);
            result.push(pair);
            offset += sizeBits;
        }

        return result;
    }

    public get nfpPairsCount(): usize {
        return nfp_store_get_nfp_pairs_count();
    }

    public get placementCount(): usize {
        return nfp_store_get_placement_count();
    }

    public get phenotypeSource(): u16 {
        return nfp_store_get_phenotype_source();
    }
}
