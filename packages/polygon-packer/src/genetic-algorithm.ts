import {
    genetic_algorithm_init,
    genetic_algorithm_clean,
    genetic_algorithm_get_individual,
    genetic_algorithm_update_fitness
} from 'wasm-nesting';
import { BoundRectF32 } from './geometry';
import { i32, NestConfig, u16 } from './types';
import { serializeConfig } from './helpers';
import PolygonNode from './polygon-node';

export default class GeneticAlgorithmWasm {
    static #instance: GeneticAlgorithmWasm;

    private constructor() { }

    public static get instance(): GeneticAlgorithmWasm {
        if (!GeneticAlgorithmWasm.#instance) {
            GeneticAlgorithmWasm.#instance = new GeneticAlgorithmWasm();
        }

        return GeneticAlgorithmWasm.#instance;
    }

    public init(nodes: PolygonNode[], bounds: BoundRectF32, config: NestConfig): void {
        // Serialize nodes
        const serializedNodes = PolygonNode.serialize(nodes);
        const nodesFloat32 = new Float32Array(serializedNodes);

        // Serialize bounds
        const boundsArray = new Float32Array([bounds.x, bounds.y, bounds.width, bounds.height]);

        // Serialize config
        const configSerialized = serializeConfig(config);

        // Call WASM
        genetic_algorithm_init(nodesFloat32, boundsArray, configSerialized);
    }

    public clean(): void {
        genetic_algorithm_clean();
    }

    public getIndividual(nodes: PolygonNode[]): { source: u16, placement: i32[], rotation: u16[] } | null {
        // Serialize nodes
        const serializedNodes = PolygonNode.serialize(nodes);
        const nodesFloat32 = new Float32Array(serializedNodes);

        // Call WASM
        const result = genetic_algorithm_get_individual(nodesFloat32);

        if (result.length === 0) {
            return null;
        }

        // Deserialize: source (u16) + placement_count (u32) + placement[] (i32[]) + rotation[] (u16[])
        const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
        let offset = 0;

        const source = view.getUint16(offset, true);
        offset += 2;

        const placementCount = view.getUint32(offset, true);
        offset += 4;

        const placement: number[] = [];
        for (let i = 0; i < placementCount; i++) {
            placement.push(view.getInt32(offset, true));
            offset += 4;
        }

        const rotation: u16[] = [];
        for (let i = 0; i < placementCount; i++) {
            rotation.push(view.getUint16(offset, true));
            offset += 2;
        }

        return { source, placement, rotation };
    }

    public updateFitness(source: u16, fitness: number): void {
        genetic_algorithm_update_fitness(source, fitness);
    }
}
