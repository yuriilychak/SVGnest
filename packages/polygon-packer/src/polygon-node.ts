import { generate_nfp_cache_key_wasm } from 'wasm-nesting';
import { i32, u16 } from "./types";

export default class PolygonNode {
    public source: i32;
    public rotation: u16;
    public memSeg: Float32Array;
    public children: PolygonNode[];

    constructor(source: i32, rotation: u16, memSeg: Float32Array, children: PolygonNode[]) {
        this.source = source;
        this.rotation = rotation;
        this.memSeg = memSeg;
        this.children = children;
    }

    public clone(): PolygonNode {
        return new PolygonNode(this.source, this.rotation,
            this.memSeg.slice(),
            this.children.map((child) => child.clone())
        );
    }

    public static generateNFPCacheKey(
        rotationSplit: number,
        inside: boolean,
        polygon1: PolygonNode,
        polygon2: PolygonNode
    ): number {
        return generate_nfp_cache_key_wasm(
            rotationSplit,
            inside,
            polygon1.source,
            polygon1.rotation,
            polygon2.source,
            polygon2.rotation
        );
    }

    public static serialize(nodes: PolygonNode[], offset: number = 0): ArrayBuffer {
        const initialOffset = Uint32Array.BYTES_PER_ELEMENT + offset;
        const totalSize: number = PolygonNode.calculateTotalSize(nodes, initialOffset);
        const buffer: ArrayBuffer = new ArrayBuffer(totalSize);
        const view: DataView = new DataView(buffer);

        view.setUint32(offset, nodes.length);

        PolygonNode.serializeInner(nodes, buffer, view, initialOffset);

        return buffer;
    }

    public static deserialize(buffer: ArrayBuffer): PolygonNode[] {
        const view = new DataView(buffer);
        const rootCount = view.getUint32(0, true);
        const nodes = new Array<PolygonNode>(rootCount);

        PolygonNode.deserializeInner(nodes, view, buffer, 4);

        return nodes;
    }

    private static calculateTotalSize(nodes: PolygonNode[], initialSize: number): number {
        return nodes.reduce<number>((result: number, node: PolygonNode) => {
            const nodeSize = (Uint32Array.BYTES_PER_ELEMENT << 2) + node.memSeg.byteLength;
            const newResult = result + nodeSize;

            return PolygonNode.calculateTotalSize(node.children, newResult);
        }, initialSize);
    }

    private static serializeInner(nodes: PolygonNode[], buffer: ArrayBuffer, view: DataView, offset: number): number {
        return nodes.reduce((result: number, node: PolygonNode) => {
            view.setUint32(result, node.source + 1);
            result += Uint32Array.BYTES_PER_ELEMENT;
            view.setFloat32(result, node.rotation);
            result += Uint32Array.BYTES_PER_ELEMENT;

            const memSegLength = node.memSeg.length;
            view.setUint32(result, memSegLength >> 1);
            result += Uint32Array.BYTES_PER_ELEMENT;

            const memSegBytes = new Uint8Array(node.memSeg.buffer, node.memSeg.byteOffset, node.memSeg.byteLength);
            new Uint8Array(buffer, result).set(memSegBytes);
            result += memSegBytes.byteLength;

            const childrenCount = node.children.length;
            view.setUint32(result, childrenCount);
            result += Uint32Array.BYTES_PER_ELEMENT;

            return PolygonNode.serializeInner(node.children, buffer, view, result);
        }, offset);
    }

    private static deserializeInner(nodes: PolygonNode[], view: DataView, buffer: ArrayBuffer, initialOffset: number): number {
        const nodeCount: number = nodes.length;
        let offset: number = initialOffset;
        let memSegLength: number = 0;
        let childrenCount: number = 0;
        let source: number = 0;
        let rotation: number = 0;
        let memSeg: Float32Array = null;
        let children: PolygonNode[] = null;
        let i: number = 0;

        for (i = 0; i < nodeCount; ++i) {
            source = view.getUint32(offset, true) - 1; // true = little-endian
            offset += Uint32Array.BYTES_PER_ELEMENT;
            rotation = view.getFloat32(offset, true); // true = little-endian
            offset += Uint32Array.BYTES_PER_ELEMENT;
            memSegLength = view.getUint32(offset, true) << 1; // true = little-endian
            offset += Uint32Array.BYTES_PER_ELEMENT;

            // Copy Float32 data to ensure proper alignment
            memSeg = new Float32Array(memSegLength);
            for (let j = 0; j < memSegLength; j++) {
                memSeg[j] = view.getFloat32(offset, true); // true = little-endian
                offset += Float32Array.BYTES_PER_ELEMENT;
            }

            childrenCount = view.getUint32(offset, true); // true = little-endian
            offset += Uint32Array.BYTES_PER_ELEMENT;
            children = new Array(childrenCount);
            offset = PolygonNode.deserializeInner(children, view, buffer, offset);
            nodes[i] = new PolygonNode(source, rotation, memSeg, children);
        }

        return offset;
    }
}