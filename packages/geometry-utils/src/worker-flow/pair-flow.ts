import { pair_data_f32 } from 'wasm-nesting';
import { WorkerConfig } from './types';

export function pairData(buffer: ArrayBuffer, config: WorkerConfig): ArrayBuffer {
    return pair_data_f32(new Float32Array(buffer)).buffer as ArrayBuffer;
}