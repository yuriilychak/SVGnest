import { NFP_INFO_START_INDEX } from '../constants';
import { deserializePolygonNodes, getUint16, joinUint16, keyToNFPData } from '../helpers';
import { NFPContent, PolygonNode } from '../types';
import WorkerContent from './worker-content';

export default class PairContent extends WorkerContent {
    private _key: number;

    private _nodes: PolygonNode[];

    private _content: NFPContent;

    constructor(buffer: ArrayBuffer) {
        const view: DataView = new DataView(buffer);

        super(view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 2));

        this._key = view.getFloat64(Float64Array.BYTES_PER_ELEMENT);
        this._nodes = deserializePolygonNodes(buffer, Float64Array.BYTES_PER_ELEMENT * 3);
        this._content = keyToNFPData(this._key, this.nestConfig.rotations);
    }

    public getResult(nfpArrays: Float64Array[]): Float64Array {
        const nfpCount: number = nfpArrays.length;
        const info = new Float64Array(nfpCount);
        let totalSize: number = NFP_INFO_START_INDEX + nfpCount;
        let size: number = 0;
        let i: number = 0;

        for (i = 0; i < nfpCount; ++i) {
            size = nfpArrays[i].length;
            info[i] = joinUint16(size, totalSize);
            totalSize += size;
        }

        const result = new Float64Array(totalSize);

        result[0] = this._key;
        result[1] = nfpCount;

        result.set(info, NFP_INFO_START_INDEX);

        for (i = 0; i < nfpCount; ++i) {
            result.set(nfpArrays[i], getUint16(info[i], 1));
        }

        return result;
    }

    public get firstNode(): PolygonNode {
        return this._nodes[0];
    }

    public get secondNode(): PolygonNode {
        return this._nodes[1];
    }

    public get isBroken(): boolean {
        return this._nodes.length === 0;
    }

    public get key(): number {
        return this._key;
    }

    public get isUseHoles(): boolean {
        return this.nestConfig.useHoles && this.firstNode.children.length !== 0;
    }

    public get isInside(): boolean {
        return this._content.inside;
    }
}
