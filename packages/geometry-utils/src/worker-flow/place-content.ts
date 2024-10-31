import {
    deserializeBufferToMap,
    deserializePolygonNodes,
    generateNFPCacheKey,
    getPolygonNode,
    joinUint16,
    toRotationIndex
} from '../helpers';
import { NFPCache, PolygonNode } from '../types';
import WorkerContent from './worker-content';

export default class PlaceContent extends WorkerContent {
    private _nfpCache: NFPCache;

    private _area: number;

    private _nodes: PolygonNode[];

    private _emptyNode: PolygonNode;

    constructor(buffer: ArrayBuffer) {
        const view: DataView = new DataView(buffer);
        const mapBufferSize: number = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 3);

        super(view.getFloat64(Float64Array.BYTES_PER_ELEMENT));

        this._area = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 2);
        this._nodes = deserializePolygonNodes(buffer, Float64Array.BYTES_PER_ELEMENT * 4 + mapBufferSize);
        this._nfpCache = deserializeBufferToMap(buffer, Float64Array.BYTES_PER_ELEMENT * 4, mapBufferSize);
        this._emptyNode = getPolygonNode(-1, new Float64Array(0));
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

    public get nodes(): PolygonNode[] {
        return this._nodes;
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
}
