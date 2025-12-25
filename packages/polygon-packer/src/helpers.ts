import { set_bits_u32, generate_nfp_cache_key_wasm, generate_tree_wasm, generate_bounds_wasm } from 'wasm-nesting';
import { BoundRect, NestConfig, NFPCache, PolygonNode, SourceItem } from './types';
import { BoundRectF32 } from './geometry';

export function generateNFPCacheKey(
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

export function convertPolygonNodesToSourceItems(nodes: PolygonNode[]): SourceItem[] {
    return nodes.map(node => convertPolygonNodeToSourceItem(node));
}

function convertPolygonNodeToSourceItem(node: PolygonNode): SourceItem {
    return {
        source: node.source,
        children: node.children.map(child => convertPolygonNodeToSourceItem(child))
    };
}

function calculateSourceItemsSize(items: SourceItem[]): number {
    return items.reduce((total, item) => {
        // Each item: u16 (source) + u16 (children count) = 4 bytes
        const itemSize = Uint16Array.BYTES_PER_ELEMENT * 2;
        return total + itemSize + calculateSourceItemsSize(item.children);
    }, 0);
}

function serializeSourceItemsInternal(items: SourceItem[], view: DataView, offset: number): number {
    let currentOffset = offset;

    for (const item of items) {
        // Write source (u16)
        view.setUint16(currentOffset, item.source, true);
        currentOffset += Uint16Array.BYTES_PER_ELEMENT;

        // Write children count (u16)
        view.setUint16(currentOffset, item.children.length, true);
        currentOffset += Uint16Array.BYTES_PER_ELEMENT;

        // Recursively serialize children
        currentOffset = serializeSourceItemsInternal(item.children, view, currentOffset);
    }

    return currentOffset;
}

export function serializeSourceItems(items: SourceItem[]): Uint8Array {
    // Calculate total size: u16 (count) + items data
    const itemsSize = calculateSourceItemsSize(items);
    const totalSize = Uint16Array.BYTES_PER_ELEMENT + itemsSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);

    // Write items count
    view.setUint16(0, items.length, true);

    // Serialize items
    serializeSourceItemsInternal(items, view, Uint16Array.BYTES_PER_ELEMENT);

    return new Uint8Array(buffer);
}

function deserializeSourceItemsInternal(view: DataView, offset: number, count: number): { items: SourceItem[], nextOffset: number } {
    const items: SourceItem[] = [];
    let currentOffset = offset;

    for (let i = 0; i < count; i++) {
        // Read source (u16)
        const source = view.getUint16(currentOffset, true);
        currentOffset += Uint16Array.BYTES_PER_ELEMENT;

        // Read children count (u16)
        const childrenCount = view.getUint16(currentOffset, true);
        currentOffset += Uint16Array.BYTES_PER_ELEMENT;

        // Recursively deserialize children
        const childrenResult = deserializeSourceItemsInternal(view, currentOffset, childrenCount);

        items.push({
            source,
            children: childrenResult.items
        });

        currentOffset = childrenResult.nextOffset;
    }

    return { items, nextOffset: currentOffset };
}

export function deserializeSourceItems(data: Uint8Array): SourceItem[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Read items count
    const count = view.getUint16(0, true);

    // Deserialize items
    const result = deserializeSourceItemsInternal(view, Uint16Array.BYTES_PER_ELEMENT, count);

    return result.items;
}


function calculateTotalSize(nodes: PolygonNode[], initialSize: number): number {
    return nodes.reduce<number>((result: number, node: PolygonNode) => {
        const nodeSize = (Uint32Array.BYTES_PER_ELEMENT << 2) + node.memSeg.byteLength;
        const newResult = result + nodeSize;

        return calculateTotalSize(node.children, newResult);
    }, initialSize);
}

function serializeNodes(nodes: PolygonNode[], buffer: ArrayBuffer, view: DataView, offset: number): number {
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

        return serializeNodes(node.children, buffer, view, result);
    }, offset);
}

export function deserializeNodes(nodes: PolygonNode[], view: DataView, buffer: ArrayBuffer, initialOffset: number): number {
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
        offset = deserializeNodes(children, view, buffer, offset);
        nodes[i] = { source, rotation, memSeg, children };
    }

    return offset;
}

export function serializePolygonNodes(nodes: PolygonNode[], offset: number = 0): ArrayBuffer {
    const initialOffset = Uint32Array.BYTES_PER_ELEMENT + offset;
    const totalSize: number = calculateTotalSize(nodes, initialOffset);
    const buffer: ArrayBuffer = new ArrayBuffer(totalSize);
    const view: DataView = new DataView(buffer);

    view.setUint32(offset, nodes.length);

    serializeNodes(nodes, buffer, view, initialOffset);

    return buffer;
}

export function serializeConfig(config: NestConfig): number {
    let result: number = 0;

    // Кодуємо значення в число
    result = set_bits_u32(result, config.curveTolerance * 10, 0, 4);
    result = set_bits_u32(result, config.spacing, 4, 5);
    result = set_bits_u32(result, config.rotations, 9, 5);
    result = set_bits_u32(result, config.populationSize, 14, 7);
    result = set_bits_u32(result, config.mutationRate, 21, 7);
    result = set_bits_u32(result, Number(config.useHoles), 28, 1);

    return result;
}

export function deserializeConfig(value: number): NestConfig {
    const curveTolerance = ((value >> 0) & 0xF) / 10;
    const spacing = (value >> 4) & 0x1F;
    const rotations = (value >> 9) & 0x1F;
    const populationSize = (value >> 14) & 0x7F;
    const mutationRate = (value >> 21) & 0x7F;
    const useHoles = Boolean((value >> 28) & 0x1);

    return {
        curveTolerance,
        spacing,
        rotations,
        populationSize,
        mutationRate,
        useHoles
    };
}

export function serializeMapToBuffer(map: NFPCache): ArrayBuffer {
    const totalSize: number = Array.from(map.values()).reduce(
        (acc, buffer) => acc + (Uint32Array.BYTES_PER_ELEMENT << 1) + buffer.byteLength,
        0
    );
    const resultBuffer: ArrayBuffer = new ArrayBuffer(totalSize);
    const view: DataView = new DataView(resultBuffer);
    const entries = Array.from(map.entries());
    let length: number = 0;

    entries.reduce((offset, [key, buffer]) => {
        view.setUint32(offset, key);
        offset += Uint32Array.BYTES_PER_ELEMENT;
        length = buffer.byteLength;
        view.setUint32(offset, length);
        offset += Uint32Array.BYTES_PER_ELEMENT;

        new Uint8Array(resultBuffer, offset).set(new Uint8Array(buffer));

        return offset + length;
    }, 0);

    return resultBuffer;
}

function getByteOffset(array: Float32Array, index: number): number {
    return (array.byteOffset >>> 0) + index * Float32Array.BYTES_PER_ELEMENT;
}

export function readUint32FromF32(array: Float32Array, index: number): number {
    const byteOffset = getByteOffset(array, index);
    const view = new DataView(array.buffer);

    return view.getUint32(byteOffset, true);
}

export function generateBounds(memSeg: Float32Array, spacing: number, curveTolerance: number): {
    binNode: PolygonNode;
    bounds: BoundRect<Float32Array>;
    resultBounds: BoundRect<Float32Array>;
    area: number;
} | null {
    if (memSeg.length < 6) {
        return null;
    }

    // Call WASM function
    const result = generate_bounds_wasm(memSeg, spacing, curveTolerance);

    if (result.length === 0) {
        return null;
    }

    // Extract bounds data using BoundRectF32
    const bounds = new BoundRectF32(result[0], result[1], result[2], result[3]);
    const resultBounds = new BoundRectF32(result[4], result[5], result[6], result[7]);
    const area = result[8];

    // Deserialize node from remaining bytes
    const serializedBytes = new Uint8Array(result.buffer, 36).slice(); // Start after 9 floats (36 bytes)
    const buffer = serializedBytes.buffer as ArrayBuffer;
    const view = new DataView(buffer, 0);
    const nodeCount = view.getUint32(0, true); // true = little-endian
    const nodes = new Array<PolygonNode>(nodeCount);


    deserializeNodes(nodes, view, buffer, 4);

    const binNode = nodes[0];

    return { binNode, bounds, resultBounds, area };
}

export function generateTree(memSegs: Float32Array[], spacing: number, curveTolerance: number): PolygonNode[] {
    // Flatten memSegs into a single Float32Array and create sizes array
    let totalLength = 0;
    const sizes = new Uint16Array(memSegs.length);

    for (let i = 0; i < memSegs.length; i++) {
        sizes[i] = memSegs[i].length >> 1; // Store point count (length / 2)
        totalLength += memSegs[i].length;
    }

    const values = new Float32Array(totalLength);
    let offset = 0;

    for (const memSeg of memSegs) {
        values.set(memSeg, offset);
        offset += memSeg.length;
    }

    // Call WASM function
    const serialized = generate_tree_wasm(values, sizes, spacing, curveTolerance);

    // Deserialize result
    const buffer = serialized.buffer as ArrayBuffer;
    const view = new DataView(buffer);
    const rootCount = view.getUint32(0, true); // true = little-endian
    const nodes = new Array<PolygonNode>(rootCount);

    deserializeNodes(nodes, view, buffer, 4); // Start after the u32 count (4 bytes)

    return nodes;
}
