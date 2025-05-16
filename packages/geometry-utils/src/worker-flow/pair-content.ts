import { NFP_KEY_INDICES } from '../constants';
import { getBits } from '../helpers';
import { PolygonNode } from '../types';
import NFPWrapper from './nfp-wrapper';
import WorkerContent from './worker-content';

export default class PairContent extends WorkerContent {
    private _key: number = 0;

    private _isInside: boolean = false;

    private _useHoles: boolean = false;

    public init(buffer: ArrayBuffer): this {
        this.initNodes(buffer, Uint32Array.BYTES_PER_ELEMENT * 3);
        const view: DataView = new DataView(buffer);

        const nestConfig: number = view.getUint32(Uint32Array.BYTES_PER_ELEMENT * 2);

        this._key = view.getUint32(Uint32Array.BYTES_PER_ELEMENT);
        this._isInside = PairContent.getInside(this._key);
        this._useHoles = Boolean(getBits(nestConfig, 28, 1));

        return this;
    }

    public clean(): void {
        super.clean();

        this._key = 0;
        this._isInside = false;
    }

    public getResult(nfpArrays: Float32Array[]): ArrayBuffer {
        return NFPWrapper.serialize(this._key, nfpArrays);
    }

    public logError(message: string): void {
        console.log(`${message}: `, this._key);
        console.log('A: ', this.firstNode.source, this.firstNode.rotation, this.firstNode.memSeg.join(', '));
        console.log('B: ', this.secondNode.source, this.secondNode.rotation, this.secondNode.memSeg.join(', '));
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
