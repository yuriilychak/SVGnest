import { place_paths_wasm } from 'wasm-nesting';


export function placePaths(buffer: ArrayBuffer): ArrayBuffer {
    const result = place_paths_wasm(new Uint8Array(buffer));
    return result.buffer as ArrayBuffer;
}
