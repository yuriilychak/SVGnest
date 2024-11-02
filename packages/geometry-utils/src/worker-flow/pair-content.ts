import { NFP_INFO_START_INDEX, NFP_KEY_INDICES } from '../constants';
import { getBits, getUint16, joinUint16 } from '../helpers';
import { PolygonNode } from '../types';
import WorkerContent from './worker-content';

export default class PairContent extends WorkerContent {
    private _key: number = 0;

    private _isInside: boolean = false;

    private _useHoles: boolean = false;

    public init(buffer: ArrayBuffer): this {
        this.initNodes(buffer, Float64Array.BYTES_PER_ELEMENT * 3);
        const view: DataView = new DataView(buffer);

        const nestConfig: number = view.getFloat64(Float64Array.BYTES_PER_ELEMENT * 2);

        this._key = view.getFloat64(Float64Array.BYTES_PER_ELEMENT);
        this._isInside = PairContent.getInside(this._key);
        this._useHoles = Boolean(getBits(nestConfig, 28, 1));

        return this;
    }

    public clean(): void {
        super.clean();

        this._key = 0;
        this._isInside = false;
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
        return this.nodeAt(0);
    }

    public get secondNode(): PolygonNode {
        return this.nodeAt(1);
    }

    public get isUseHoles(): boolean {
        return this._useHoles && this.firstNode.children.length !== 0;
    }

    public get isInside(): boolean {
        return this._isInside;
    }

    private static getInside(numKey: number): boolean {
        const insideBitIndex = NFP_KEY_INDICES[4];
        const insideValue = getBits(numKey, insideBitIndex, 1);

        return Boolean(insideValue);
    }
}
