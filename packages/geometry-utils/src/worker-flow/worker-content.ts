import { PolygonNode } from '../types';

export default abstract class WorkerContent {
    private _nodes: PolygonNode[] = null;

    public abstract init(buffer: ArrayBuffer): this;

    protected initNodes(buffer: ArrayBuffer, offset: number): void {
        const initialOffset = Uint32Array.BYTES_PER_ELEMENT + offset;
        const view: DataView = new DataView(buffer);
        const rootNodeCount = view.getUint32(offset);

        this._nodes = new Array(rootNodeCount);

        WorkerContent.deserializeNodes(this._nodes, view, buffer, initialOffset);
    }

    public clean(): void {
        this._nodes = null;
    }

    public nodeAt(index: number): PolygonNode {
        return this._nodes[index];
    }

    public removeNode(node: PolygonNode): void {
        const index: number = this._nodes.indexOf(node);

        if (index !== -1) {
            this._nodes.splice(index, 1);
        }
    }

    public get isBroken(): boolean {
        return this._nodes.length === 0;
    }

    public get nodeCount(): number {
        return this._nodes.length;
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
}
