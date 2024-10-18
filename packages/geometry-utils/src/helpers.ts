import { NFP_KEY_INDICES, TOL, UINT16_BIT_COUNT } from './constants';
import { NestConfig, NFPContent, PolygonNode } from './types';

export function getMask(bitCount: number, offset: number = 0): number {
    return ((1 << bitCount) - 1) << offset;
}

export function setBits(source: number, value: number, index: number, bitCount: number): number {
    const mask = getMask(bitCount, index);

    return (source & ~mask) | ((value << index) & mask);
}

export function getBits(source: number, index: number, numBits: number): number {
    return (source >>> index) & getMask(numBits);
}

export function getUint16(source: number, index: number): number {
    return getBits(source, index * UINT16_BIT_COUNT, UINT16_BIT_COUNT);
}

export function joinUint16(value1: number, value2: number): number {
    return value1 | (value2 << UINT16_BIT_COUNT);
}

export function almostEqual(a: number, b: number = 0, tolerance: number = TOL): boolean {
    return Math.abs(a - b) < tolerance;
}

export function midValue(value: number, leftRange: number, rightRange: number): number {
    return Math.abs(2 * value - leftRange - rightRange) - Math.abs(leftRange - rightRange);
}

export function cycleIndex(index: number, size: number, offset: number): number {
    return (index + size + offset) % size;
}

function shiftNfpVaue(value: number, index: number): number {
    return value << NFP_KEY_INDICES[index];
}

function unshiftNfpVaue(value: number, index: number): number {
    return value >> NFP_KEY_INDICES[index];
}

export function toRotationIndex(angle: number, rotationSplit: number): number {
    return Math.round((angle * rotationSplit) / 360);
}

export function generateNFPCacheKey(rotationSplit: number, inside: boolean, polygon1: PolygonNode, polygon2: PolygonNode) {
    const rotationIndex1: number = toRotationIndex(polygon1.rotation, rotationSplit);
    const rotationIndex2: number = toRotationIndex(polygon2.rotation, rotationSplit);
    const data: number[] = [polygon1.source + 1, polygon2.source + 1, rotationIndex1, rotationIndex2, inside ? 1 : 0];
    const size: number = data.length;
    let result: number = 0;
    let i: number = 0;

    for (i = 0; i < size; ++i) {
        result += shiftNfpVaue(data[i], i);
    }

    return result;
}

export function keyToNFPData(numKey: number, rotationSplit: number): NFPContent {
    const rotationOffset: number = Math.round(360 / rotationSplit);
    const size: number = 5;
    const result: number[] = new Array(size);
    let accumulator: number = 0;
    let i: number = 0;

    for (i = size - 1; i >= 0; --i) {
        result[i] = unshiftNfpVaue(numKey - accumulator, i);
        accumulator += shiftNfpVaue(result[i], i);
    }

    return {
        A: result[0] - 1,
        B: result[1] - 1,
        inside: Boolean(result[4]),
        Arotation: result[2] * rotationOffset,
        Brotation: result[3] * rotationOffset
    };
}

export function getPolygonNode(source: number, memSeg: Float64Array): PolygonNode {
    return { source, rotation: 0, memSeg, children: [] };
}

function calculateTotalSize(nodes: PolygonNode[], initialSize: number): number {
    return nodes.reduce<number>((result: number, node: PolygonNode) => {
        const nodeSize = ((Float64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT) << 1) + node.memSeg.byteLength;
        const newResult = result + nodeSize;

        return calculateTotalSize(node.children, newResult);
    }, initialSize);
}

// Винесена функція для серіалізації вузлів
function serializeNodes(nodes: PolygonNode[], buffer: ArrayBuffer, view: DataView, offset: number): number {
    return nodes.reduce((result: number, node: PolygonNode) => {
        // Записуємо source і rotation
        view.setFloat64(result, node.source + 1);
        result += Float64Array.BYTES_PER_ELEMENT;
        view.setFloat64(result, node.rotation);
        result += Float64Array.BYTES_PER_ELEMENT;

        // Записуємо memSeg
        const memSegLength = node.memSeg.length; // Кількість точок
        view.setUint32(result, memSegLength >> 1); // Зберігаємо кількість точок
        result += Uint32Array.BYTES_PER_ELEMENT;

        // Копіюємо memSeg
        const memSegBytes = new Uint8Array(node.memSeg.buffer, node.memSeg.byteOffset, node.memSeg.byteLength);
        new Uint8Array(buffer, result).set(memSegBytes);
        result += memSegBytes.byteLength;

        // Записуємо кількість дітей
        const childrenCount = node.children.length;
        view.setUint32(result, childrenCount);
        result += Uint32Array.BYTES_PER_ELEMENT;

        // Рекурсивно серіалізуємо дітей
        return serializeNodes(node.children, buffer, view, result);
    }, offset);
}

function deserializeNodes(nodes: PolygonNode[], view: DataView, buffer: ArrayBuffer, initialOffset: number): number {
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
        // Читаємо source і rotation
        source = view.getFloat64(offset) - 1;
        offset += Float64Array.BYTES_PER_ELEMENT;
        rotation = view.getFloat64(offset);
        offset += Float64Array.BYTES_PER_ELEMENT;
        // Читаємо memSeg
        memSegLength = view.getUint32(offset) << 1; // Кількість точок, кожна має 2 координати
        offset += Uint32Array.BYTES_PER_ELEMENT;
        // Створюємо Float64Array без копіювання даних (вказуємо offset і довжину)
        memSeg = new Float64Array(buffer, offset, memSegLength);
        offset += memSeg.byteLength;

        // Читаємо кількість дітей
        childrenCount = view.getUint32(offset);
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

export function deserializePolygonNodes(buffer: ArrayBuffer, offset: number = 0): PolygonNode[] {
    const initialOffset = Uint32Array.BYTES_PER_ELEMENT + offset;
    const view: DataView = new DataView(buffer);
    const rootNodeCount = view.getUint32(offset);
    const nodes: PolygonNode[] = new Array(rootNodeCount);

    deserializeNodes(nodes, view, buffer, initialOffset);

    return nodes;
}

export function serializeConfig(config: NestConfig): number {
    let result: number = 0;

    // Кодуємо значення в число
    result = setBits(result, config.curveTolerance * 10, 0, 4);
    result = setBits(result, config.spacing, 4, 5);
    result = setBits(result, config.rotations, 9, 5);
    result = setBits(result, config.populationSize, 14, 7);
    result = setBits(result, config.mutationRate, 21, 7);
    result = setBits(result, Number(config.useHoles), 28, 1);
    result = setBits(result, Number(config.exploreConcave), 29, 1);

    return result;
}

export function deserializeConfig(value: number): NestConfig {
    return {
        curveTolerance: getBits(value, 0, 4) / 10,
        spacing: getBits(value, 4, 5),
        rotations: getBits(value, 9, 5),
        populationSize: getBits(value, 14, 7),
        mutationRate: getBits(value, 21, 7),
        useHoles: Boolean(getBits(value, 28, 1)),
        exploreConcave: Boolean(getBits(value, 29, 1))
    };
}
