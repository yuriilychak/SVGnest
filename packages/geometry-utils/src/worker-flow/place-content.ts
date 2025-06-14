import { get_bits_u32, join_u16_to_u32, to_rotation_index_wasm } from 'wasm-nesting';
import { generateNFPCacheKey, getPolygonNode } from '../helpers';
import { NFPCache, PolygonNode } from '../types';
import WorkerContent from './worker-content';

export default class PlaceContent extends WorkerContent {
    private _nfpCache: NFPCache = null;

    private _area: number = 0;

    private _emptyNode: PolygonNode;

    private _rotations: number = 0;

    constructor() {
        super();
        this._emptyNode = getPolygonNode(-1, new Float32Array(0));
    }

    public init(buffer: ArrayBuffer): this {
        const view: DataView = new DataView(buffer);
        const mapBufferSize: number = view.getUint32(Uint32Array.BYTES_PER_ELEMENT * 3);
        const nestConfig: number = view.getUint32(Uint32Array.BYTES_PER_ELEMENT);

        this.initNodes(buffer, Uint32Array.BYTES_PER_ELEMENT * 4 + mapBufferSize);

        this._rotations = get_bits_u32(nestConfig, 9, 5);
        this._area = view.getFloat32(Uint32Array.BYTES_PER_ELEMENT * 2);
        this._nfpCache = PlaceContent.deserializeBufferToMap(buffer, Uint32Array.BYTES_PER_ELEMENT * 4, mapBufferSize);

        return this;
    }

    public clean(): void {
        super.clean();
        this._nfpCache = null;
        this._area = 0;
    }

    public getBinNfp(index: number): ArrayBuffer | null {
        const key: number = generateNFPCacheKey(this.rotations, true, this._emptyNode, this.nodeAt(index));

        return this._nfpCache.has(key) ? this._nfpCache.get(key) : null;
    }

    // ensure all necessary NFPs exist
    public getNfpError(placed: PolygonNode[], path: PolygonNode): boolean {
        const placedCount: number = placed.length;
        let i: number = 0;
        let key: number = 0;

        for (i = 0; i < placedCount; ++i) {
            key = generateNFPCacheKey(this.rotations, false, placed[i], path);

            if (!this._nfpCache.has(key)) {
                return true;
            }
        }

        return false;
    }

    public getPathKey(index: number): number {
        return join_u16_to_u32(to_rotation_index_wasm(this.nodeAt(index).rotation, this.rotations), this.nodeAt(index).source);
    }

    public get rotations(): number {
        return this._rotations;
    }

    public get nfpCache(): NFPCache {
        return this._nfpCache;
    }

    public get area(): number {
        return this._area;
    }

    private static deserializeBufferToMap(buffer: ArrayBuffer, initialOffset: number, bufferSize: number): NFPCache {
        const view: DataView = new DataView(buffer);
        const map: NFPCache = new Map<number, ArrayBuffer>();
        const resultOffset: number = initialOffset + bufferSize;
        let offset: number = initialOffset;
        let key: number = 0;
        let length: number = 0;
        let valueBuffer: ArrayBuffer = null;

        while (offset < resultOffset) {
            key = view.getUint32(offset);
            offset += Uint32Array.BYTES_PER_ELEMENT;
            length = view.getUint32(offset);
            offset += Uint32Array.BYTES_PER_ELEMENT;
            valueBuffer = buffer.slice(offset, offset + length);
            offset += length;

            map.set(key, valueBuffer);
        }

        return map;
    }
}
