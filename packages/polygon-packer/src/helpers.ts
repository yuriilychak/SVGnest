import { set_bits_u32, generate_tree_wasm, generate_bounds_wasm } from 'wasm-nesting';
import { BoundRect, NestConfig, NFPCache } from './types';
import { BoundRectF32 } from './geometry';
import PolygonNode from './polygon-node';

export function serializeConfig(config: NestConfig): number {
    let result: number = 0;

    // Кодуємо значення в число
    result = set_bits_u32(result, config.curveTolerance * 10, 0, 4);
    result = set_bits_u32(result, config.spacing, 4, 5);
    result = set_bits_u32(result, config.rotations, 9, 5);
    result = set_bits_u32(result, config.populationSize, 14, 7);
    result = set_bits_u32(result, config.mutationRate, 21, 7);
    result = set_bits_u32(result, Number(config.useHoles), 28, 1);

    return result;
}

export function deserializeConfig(value: number): NestConfig {
    const curveTolerance = ((value >> 0) & 0xF) / 10;
    const spacing = (value >> 4) & 0x1F;
    const rotations = (value >> 9) & 0x1F;
    const populationSize = (value >> 14) & 0x7F;
    const mutationRate = (value >> 21) & 0x7F;
    const useHoles = Boolean((value >> 28) & 0x1);

    return {
        curveTolerance,
        spacing,
        rotations,
        populationSize,
        mutationRate,
        useHoles
    };
}

export function serializeMapToBuffer(map: NFPCache): ArrayBuffer {
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

function getByteOffset(array: Float32Array, index: number): number {
    return (array.byteOffset >>> 0) + index * Float32Array.BYTES_PER_ELEMENT;
}

export function readUint32FromF32(array: Float32Array, index: number): number {
    const byteOffset = getByteOffset(array, index);
    const view = new DataView(array.buffer);

    return view.getUint32(byteOffset, true);
}

export function generateBounds(memSeg: Float32Array, spacing: number, curveTolerance: number): {
    binNode: PolygonNode;
    bounds: BoundRect<Float32Array>;
    resultBounds: BoundRect<Float32Array>;
    area: number;
} | null {
    if (memSeg.length < 6) {
        return null;
    }

    // Call WASM function
    const result = generate_bounds_wasm(memSeg, spacing, curveTolerance);

    if (result.length === 0) {
        return null;
    }

    // Extract bounds data using BoundRectF32
    const bounds = new BoundRectF32(result[0], result[1], result[2], result[3]);
    const resultBounds = new BoundRectF32(result[4], result[5], result[6], result[7]);
    const area = result[8];

    // Deserialize node from remaining bytes
    const serializedBytes = new Uint8Array(result.buffer, 36).slice(); // Start after 9 floats (36 bytes)
    const buffer = serializedBytes.buffer as ArrayBuffer;
    const nodes = PolygonNode.deserialize(buffer);

    const binNode = nodes[0];

    return { binNode, bounds, resultBounds, area };
}

export function generateTree(memSegs: Float32Array[], spacing: number, curveTolerance: number): PolygonNode[] {
    // Flatten memSegs into a single Float32Array and create sizes array
    let totalLength = 0;
    const sizes = new Uint16Array(memSegs.length);

    for (let i = 0; i < memSegs.length; i++) {
        sizes[i] = memSegs[i].length >> 1; // Store point count (length / 2)
        totalLength += memSegs[i].length;
    }

    const values = new Float32Array(totalLength);
    let offset = 0;

    for (const memSeg of memSegs) {
        values.set(memSeg, offset);
        offset += memSeg.length;
    }

    // Call WASM function
    const serialized = generate_tree_wasm(values, sizes, spacing, curveTolerance);

    return PolygonNode.deserialize(serialized.buffer); // Start after the u32 count (4 bytes)
}
