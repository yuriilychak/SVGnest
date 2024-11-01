import { getBits } from '../helpers';
import { NestConfig, PolygonNode } from '../types';

export default abstract class WorkerContent {
    private _nestConfig: NestConfig = null;

    public abstract init(buffer: ArrayBuffer): this;

    public clean(): void {
        this._nestConfig = null;
    }

    protected initNestConfig(nestValue: number): void {
        this._nestConfig = WorkerContent.deserializeConfig(nestValue);
    }

    protected get nestConfig(): NestConfig {
        return this._nestConfig;
    }

    private static deserializeConfig(value: number): NestConfig {
        return {
            curveTolerance: getBits(value, 0, 4) / 10,
            spacing: getBits(value, 4, 5),
            rotations: getBits(value, 9, 5),
            populationSize: getBits(value, 14, 7),
            mutationRate: getBits(value, 21, 7),
            useHoles: Boolean(getBits(value, 28, 1))
        };
    }

    private static deserializeNodes(nodes: PolygonNode[], view: DataView, buffer: ArrayBuffer, initialOffset: number): number {
        const nodeCount: number = nodes.length;
        let offset: number = initialOffset;
        let memSegLength: number = 0;
        let childrenCount: number = 0;
        let source: number = 0;
        let rotation: number = 0;
        let memSeg: Float64Array = null;
        let children: PolygonNode[] = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            source = view.getFloat64(offset) - 1;
            offset += Float64Array.BYTES_PER_ELEMENT;
            rotation = view.getFloat64(offset);
            offset += Float64Array.BYTES_PER_ELEMENT;
            memSegLength = view.getUint32(offset) << 1;
            offset += Uint32Array.BYTES_PER_ELEMENT;
            memSeg = new Float64Array(buffer, offset, memSegLength);
            offset += memSeg.byteLength;
            childrenCount = view.getUint32(offset);
            offset += Uint32Array.BYTES_PER_ELEMENT;
            children = new Array(childrenCount);
            offset = WorkerContent.deserializeNodes(children, view, buffer, offset);
            nodes[i] = { source, rotation, memSeg, children };
        }

        return offset;
    }

    protected static deserializePolygonNodes(buffer: ArrayBuffer, offset: number = 0): PolygonNode[] {
        const initialOffset = Uint32Array.BYTES_PER_ELEMENT + offset;
        const view: DataView = new DataView(buffer);
        const rootNodeCount = view.getUint32(offset);
        const nodes: PolygonNode[] = new Array(rootNodeCount);

        WorkerContent.deserializeNodes(nodes, view, buffer, initialOffset);

        return nodes;
    }
}
