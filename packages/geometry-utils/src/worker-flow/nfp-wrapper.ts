import { getUint16, joinUint16 } from "../helpers";

export default class NFPWrapper {
    private _buffer: ArrayBuffer | null = null;

    private _view: DataView | null = null;

    constructor(buffer: ArrayBuffer | null = null) {
        this._buffer = buffer;
        this._view = buffer !== null ? new DataView(buffer) : null;
    }

    public getNFPMemSeg(index: number): Float32Array | null {
        if (this._view === null) {
            return null;
        }

        const compressedInfo: number = this._view.getFloat64((NFPWrapper.NFP_INFO_START_INDEX + index) * Float64Array.BYTES_PER_ELEMENT, true);
        const offset: number = getUint16(compressedInfo, 1);
        const size: number = getUint16(compressedInfo, 0);

        return Float32Array.from(new Float64Array(this._buffer, offset * Float64Array.BYTES_PER_ELEMENT, size));
    }

    public get buffer(): ArrayBuffer {
        return this._buffer;
    }

    public set buffer(value: ArrayBuffer) {
        this._buffer = value;
        this._view = this._buffer !== null ? new DataView(this._buffer) : null;
    }

    public get count(): number {
        return this._view !== null ? this._view.getFloat64(1 * Float64Array.BYTES_PER_ELEMENT, true) : 0;
    }

    public get isBroken(): boolean {
        return this._buffer === null || this._buffer.byteLength < 3 * Float64Array.BYTES_PER_ELEMENT;
    }
    
    public static serialize(key: number, nfpArrays: Float32Array[]): ArrayBuffer {
            const nfpCount: number = nfpArrays.length;
            const info = new Float64Array(nfpCount);
            let totalSize: number = NFPWrapper.NFP_INFO_START_INDEX + nfpCount;
            let size: number = 0;
            let i: number = 0;
    
            for (i = 0; i < nfpCount; ++i) {
                size = nfpArrays[i].length;
                info[i] = joinUint16(size, totalSize);
                totalSize += size;
            }
    
            const result = new Float64Array(totalSize);
    
            result[0] = key;
            result[1] = nfpCount;
    
            result.set(info, NFPWrapper.NFP_INFO_START_INDEX);
    
            for (i = 0; i < nfpCount; ++i) {
                result.set(nfpArrays[i], getUint16(info[i], 1));
            }
    
            return result.buffer;
        }

    private static NFP_INFO_START_INDEX = 2;
}