import { IPoint, NFPPair, PolygonNode } from './types';
import Point from './point';
import Polygon from './polygon';

// Main function to nest polygons
export function nestPolygons(polygon: Polygon, point: Point, polygons: PolygonNode[]): void {
    const parents: PolygonNode[] = [];
    let i: number = 0;
    let j: number = 0;

    // assign a unique id to each leaf
    let outerNode: PolygonNode = null;
    let innerNode: PolygonNode = null;
    let isChild: boolean = false;

    for (i = 0; i < polygons.length; ++i) {
        outerNode = polygons[i];
        isChild = false;
        point.fromMemSeg(outerNode.memSeg, 0);

        for (j = 0; j < polygons.length; ++j) {
            innerNode = polygons[j];
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

    for (i = 0; i < polygons.length; ++i) {
        if (parents.indexOf(polygons[i]) < 0) {
            polygons.splice(i, 1);
            i--;
        }
    }

    const parentCount: number = parents.length;
    let parent: PolygonNode = null;

    for (i = 0; i < parentCount; ++i) {
        parent = parents[i];

        if (parent.children) {
            nestPolygons(polygon, point, parent.children);
        }
    }
}

export function pointsToMemSeg(points: IPoint[]): Float64Array {
    const pointCount: number = points.length;
    const result: Float64Array = new Float64Array(pointCount << 1);
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        result[i << 1] = points[i].x;
        result[(i << 1) + 1] = points[i].y;
    }

    return result;
}

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
