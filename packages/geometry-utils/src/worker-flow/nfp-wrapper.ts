import { join_u16_to_u32, get_u16_from_u32 } from 'wasm-nesting';
import { writeUint32ToF32 } from "../helpers";

export default class NFPWrapper {
    private _buffer: ArrayBuffer;

    private _view: DataView;

    constructor(buffer: ArrayBuffer = NFPWrapper.EMPTY_BUFFER) {
        this._buffer = buffer;
        this._view = new DataView(buffer);
    }

    public getNFPMemSeg(index: number): Float32Array {
        if (this.isBroken) {
            return new Float32Array(0);
        }

        const compressedInfo: number = this.getUint32(NFPWrapper.NFP_INFO_START_INDEX + index);
        const offset: number = get_u16_from_u32(compressedInfo, 1) * Float32Array.BYTES_PER_ELEMENT;
        const size: number = get_u16_from_u32(compressedInfo, 0);

        return new Float32Array(this._buffer, offset, size);
    }

    private getUint32(index: number): number {
        return this._view.getUint32(index * Float32Array.BYTES_PER_ELEMENT, true);
    }

    public get buffer(): ArrayBuffer {
        return this._buffer;
    }

    public set buffer(value: ArrayBuffer) {
        this._buffer = value || NFPWrapper.EMPTY_BUFFER;
        this._view = new DataView(this._buffer);
    }

    public get count(): number {
        return this.isBroken ? 0 : this.getUint32(1);
    }

    public get isBroken(): boolean {
        return this._buffer.byteLength < 3 * Float32Array.BYTES_PER_ELEMENT;
    }
    
    public static serialize(key: number, nfpArrays: Float32Array[]): ArrayBuffer {
            const nfpCount: number = nfpArrays.length;
            const info: Uint32Array = new Uint32Array(nfpCount);
            let totalSize: number = NFPWrapper.NFP_INFO_START_INDEX + nfpCount;
            let size: number = 0;
            let i: number = 0;
    
            for (i = 0; i < nfpCount; ++i) {
                size = nfpArrays[i].length;
                info[i] = join_u16_to_u32(size, totalSize);
                totalSize += size;
            }
    
            const result = new Float32Array(totalSize);
    
            writeUint32ToF32(result, 0, key);
            writeUint32ToF32(result, 1, nfpCount);
    
            for (i = 0; i < nfpCount; ++i) {
                writeUint32ToF32(result, NFPWrapper.NFP_INFO_START_INDEX + i, info[i]);
                result.set(nfpArrays[i], get_u16_from_u32(info[i], 1));
            }
    
            return result.buffer;
        }

    private static NFP_INFO_START_INDEX: number = 2;

    private static EMPTY_BUFFER: ArrayBuffer = new ArrayBuffer(0);
}