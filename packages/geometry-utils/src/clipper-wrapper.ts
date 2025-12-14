import type { BoundRect, PolygonNode } from './types';
import { getPolygonNode } from './helpers';
import { PointF32, PolygonF32 } from './geometry';
import { clean_node_inner_wasm, offset_node_inner_wasm, abs_polygon_area } from 'wasm-nesting';

export function generateBounds(memSeg: Float32Array, spacing: number, curveTolerance: number): {
    binNode: PolygonNode;
    bounds: BoundRect<Float32Array>;
    resultBounds: BoundRect<Float32Array>;
    area: number;
} {
    if (memSeg.length < 6) {
        return null;
    }

    const polygon = new PolygonF32();
    polygon.bind(memSeg);

    const binNode: PolygonNode = getPolygonNode(-1, memSeg);
    const bounds: BoundRect<Float32Array> = polygon.exportBounds();

    cleanNode(binNode, curveTolerance);
    offsetNode(binNode, -1, spacing, curveTolerance);

    polygon.bind(binNode.memSeg);
    polygon.resetPosition();

    const resultBounds = polygon.exportBounds();
    const area: number = polygon.area;

    return { binNode, bounds, resultBounds, area };
}

export function generateTree(memSegs: Float32Array[], spacing: number, curveTolerance: number): PolygonNode[] {
    const point: PointF32 = PointF32.create();
    const trashold = curveTolerance * curveTolerance;
    const nodes: PolygonNode[] = [];
    const nodeCount: number = memSegs.length;

    for (let i = 0; i < nodeCount; ++i) {
        const memSeg = memSegs[i];
        const node = getPolygonNode(i, memSeg);

        cleanNode(node, curveTolerance);

        const absArea = abs_polygon_area(node.memSeg);

        if (absArea <= trashold) {
            console.warn('Can not parse polygon', i);
            continue;
        }

        nodes.push(node);
    }

    // turn the list into a tree
    nestPolygons(point, nodes);

    offsetNodes(nodes, 1, spacing, curveTolerance);

    simplifyNodes(nodes);

    return nodes;
}


function simplifyNodes(nodes: PolygonNode[]): void {
    const nodeCount: number = nodes.length;
    let size: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < nodeCount; ++i) {
        size = nodes[i].memSeg.length;

        simplifyNodes(nodes[i].children);

        for (j = 0; j < size; ++j) {
            nodes[i].memSeg[j] = Math.round(nodes[i].memSeg[j] * 100) / 100;
        }
    }
}

// Main function to nest polygons
function nestPolygons(point: PointF32, nodes: PolygonNode[]): void {
    const parents: PolygonNode[] = [];
    // assign a unique id to each leaf
    let nodeCount: number = nodes.length;
    let outerNode: PolygonNode = null;
    let innerNode: PolygonNode = null;
    let isChild: boolean = false;
    const polygon = new PolygonF32();

    for (let i = 0; i < nodeCount; ++i) {
        outerNode = nodes[i];
        isChild = false;
        point.fromMemSeg(outerNode.memSeg);

        for (let j = 0; j < nodeCount; ++j) {
            innerNode = nodes[j];
            polygon.bind(innerNode.memSeg);

            if (j !== i && polygon.pointIn(point)) {
                innerNode.children.push(outerNode);
                isChild = true;
                break;
            }
        }

        if (!isChild) {
            parents.push(outerNode);
        }
    }

    for (let i = 0; i < nodeCount; ++i) {
        if (parents.indexOf(nodes[i]) < 0) {
            nodes.splice(i, 1);
            --nodeCount;
            --i;
        }
    }

    const parentCount: number = parents.length;
    let parent: PolygonNode = null;

    for (let i = 0; i < parentCount; ++i) {
        parent = parents[i];

        if (parent.children) {
            nestPolygons(point, parent.children);
        }
    }
}

function offsetNodes(nodes: PolygonNode[], sign: number, spacing: number, curveTolerance: number): void {
    const nodeCont: number = nodes.length;
    let node: PolygonNode = null;
    let i: number = 0;

    for (i = 0; i < nodeCont; ++i) {
        node = nodes[i];
        offsetNode(node, sign, spacing, curveTolerance);
        offsetNodes(node.children, -sign, spacing, curveTolerance);
    }
}

function offsetNode(node: PolygonNode, sign: number, spacing: number, curveTolerance: number): void {
    node.memSeg = offset_node_inner_wasm(node.memSeg, sign, spacing, curveTolerance);
}


function cleanNode(node: PolygonNode, curveTolerance: number): void {
    const res = clean_node_inner_wasm(node.memSeg, curveTolerance);

    if (res.length) {
        node.memSeg = res;
    }
}
