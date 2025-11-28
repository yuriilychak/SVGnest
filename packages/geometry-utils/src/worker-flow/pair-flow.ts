import { pair_data_f32 } from 'wasm-nesting';

export function pairData(buffer: ArrayBuffer): ArrayBuffer {
    return pair_data_f32(new Float32Array(buffer)).buffer as ArrayBuffer;
}