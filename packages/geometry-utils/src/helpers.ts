import { NFPPair, PolygonNode } from './types';
import Polygon from './polygon';

export function rotateNode(polygon: Polygon, rootNode: PolygonNode, rotation: number): void {
    polygon.bind(rootNode.memSeg);
    polygon.rotate(rotation);

    const childCount: number = rootNode.children.length;
    let i: number = 0;

    for (i = 0; i < childCount; ++i) {
        rotateNode(polygon, rootNode.children[i], rotation);
    }
}

function cloneNodes(nodes: PolygonNode[]): PolygonNode[] {
    const result: PolygonNode[] = [];
    const nodeCount: number = nodes.length;
    let node: PolygonNode = null;
    let i: number = 0;

    for (i = 0; i < nodeCount; ++i) {
        node = nodes[i];

        result.push({
            ...node,
            memSeg: node.memSeg.slice(),
            children: cloneNodes(node.children)
        });
    }

    return result;
}

export function getNfpPair(key: number, polygons: PolygonNode[]): NFPPair {
    const polygon: Polygon = Polygon.create();
    const nodes: PolygonNode[] = cloneNodes(polygons);
    const nodeCount: number = nodes.length;
    let i: number = 0;

    for (i = 0; i < nodeCount; ++i) {
        rotateNode(polygon, nodes[i], nodes[i].rotation);
    }

    return { nodes, key };
}
