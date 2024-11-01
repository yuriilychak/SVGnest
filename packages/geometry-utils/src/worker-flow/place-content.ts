import { generateNFPCacheKey, getPolygonNode, joinUint16, toRotationIndex } from '../helpers';
import { NFPCache, PolygonNode } from '../types';
import WorkerContent from './worker-content';

export default class PlaceContent extends WorkerContent {
    private _nfpCache: NFPCache = null;

    private _area: number = 0;

    private _nodes: PolygonNode[];

    private _emptyNode: PolygonNode;

    constructor() {
        super();
        this._emptyNode = getPolygonNode(-1, new Float64Array(0));
    }

    public init(buffer: ArrayBuffer): this {
        const view: DataView = new DataView(buffer);
        const mapBufferSize: number = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 3);

        this.initNestConfig(view.getFloat64(Float64Array.BYTES_PER_ELEMENT));

        this._area = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 2);
        this._nodes = WorkerContent.deserializePolygonNodes(buffer, Float64Array.BYTES_PER_ELEMENT * 4 + mapBufferSize);
        this._nfpCache = PlaceContent.deserializeBufferToMap(buffer, Float64Array.BYTES_PER_ELEMENT * 4, mapBufferSize);

        return this;
    }

    public clean(): void {
        super.clean();
        this._nfpCache = null;
        this._nodes = null;
        this._area = 0;
    }

    public getBinNfp(index: number): Float64Array | null {
        const key: number = generateNFPCacheKey(this.rotations, true, this._emptyNode, this._nodes[index]);

        return this._nfpCache.has(key) ? new Float64Array(this._nfpCache.get(key)) : null;
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
        return joinUint16(toRotationIndex(this._nodes[index].rotation, this.rotations), this._nodes[index].source);
    }

    public removeNode(node: PolygonNode): void {
        const index: number = this._nodes.indexOf(node);

        if (index !== -1) {
            this._nodes.splice(index, 1);
        }
    }

    public nodeAt(index: number): PolygonNode {
        return this._nodes[index];
    }

    public get nodeCount(): number {
        return this._nodes.length;
    }

    public get rotations(): number {
        return this.nestConfig.rotations;
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
