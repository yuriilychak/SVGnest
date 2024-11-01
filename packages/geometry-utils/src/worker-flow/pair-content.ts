import { NFP_INFO_START_INDEX } from '../constants';
import { getUint16, joinUint16, keyToNFPData } from '../helpers';
import { NFPContent, PolygonNode } from '../types';
import WorkerContent from './worker-content';

export default class PairContent extends WorkerContent {
    private _key: number = 0;

    private _nodes: PolygonNode[] = null;

    private _content: NFPContent = null;

    public init(buffer: ArrayBuffer): this {
        const view: DataView = new DataView(buffer);

        this.initNestConfig(view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 2));

        this._key = view.getFloat64(Float64Array.BYTES_PER_ELEMENT);
        this._nodes = WorkerContent.deserializePolygonNodes(buffer, Float64Array.BYTES_PER_ELEMENT * 3);
        this._content = keyToNFPData(this._key, this.nestConfig.rotations);

        return this;
    }

    public clean(): void {
        super.clean();
        this._key = 0;
        this._nodes = null;
        this._content = null;
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

    public logError(message: string): void {
        console.log(`${message}: `, this._key);
        console.log('A: ', this.firstNode);
        console.log('B: ', this.secondNode);
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

    public get isUseHoles(): boolean {
        return this.nestConfig.useHoles && this.firstNode.children.length !== 0;
    }

    public get isInside(): boolean {
        return this._content.inside;
    }
}
