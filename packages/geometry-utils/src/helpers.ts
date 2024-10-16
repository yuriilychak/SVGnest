import { BoundRect, IPoint, IPolygon, NFPPair, PolygonNode } from './types';
import Point from './point';
import { cycleIndex, getUint16 } from './shared-helpers';
import Polygon from './polygon';

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: IPoint, polygon: IPolygon): boolean {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    const innerPoint: Point = Point.from(point);
    const currPoint: Point = Point.zero();
    const prevPoint: Point = Point.zero();
    const pointCount: number = polygon.length;
    let inside: boolean = false;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        currPoint.update(polygon[i]);
        prevPoint.update(polygon[cycleIndex(i, pointCount, -1)]);

        //  no result                            exactly on the segment
        if (currPoint.almostEqual(innerPoint) || innerPoint.onSegment(currPoint, prevPoint)) {
            return null;
        }

        if (currPoint.almostEqual(prevPoint)) {
            // ignore very small lines
            continue;
        }

        if (
            currPoint.y > innerPoint.y !== prevPoint.y > innerPoint.y &&
            innerPoint.x < innerPoint.interpolateX(prevPoint, currPoint)
        ) {
            inside = !inside;
        }
    }

    return inside;
}

// returns the rectangular bounding box of the given polygon
export function getPolygonBounds(polygon: IPoint[]): BoundRect {
    if (!polygon || polygon.length < 3) {
        return null;
    }

    const pointCount: number = polygon.length;
    const min: Point = Point.from(polygon[0]);
    const size: Point = Point.from(polygon[0]);
    let i: number = 0;

    for (i = 1; i < pointCount; ++i) {
        min.min(polygon[i]);
        size.max(polygon[i]);
    }

    size.sub(min);
    const result = { x: min.x, y: min.y, width: size.x, height: size.y };

    return result;
}

// returns the area of the polygon, assuming no self-intersections
// a negative area indicates counter-clockwise winding direction
export function polygonArea(polygon: IPoint[]): number {
    const pointCount = polygon.length;
    let prevPoint: IPoint = null;
    let currPoint: IPoint = null;
    let result: number = 0;
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        prevPoint = polygon[cycleIndex(i, pointCount, -1)];
        currPoint = polygon[i];
        result += (prevPoint.x + currPoint.x) * (prevPoint.y - currPoint.y);
    }

    return 0.5 * result;
}

// Main function to nest polygons
export function nestPolygons(polygons: IPolygon[]): void {
    const parents: IPolygon[] = [];
    let i: number = 0;
    let j: number = 0;

    // assign a unique id to each leaf
    let outerNode: IPolygon = null;
    let innerNode: IPolygon = null;
    let isChild: boolean = false;

    for (i = 0; i < polygons.length; ++i) {
        outerNode = polygons[i];
        isChild = false;

        for (j = 0; j < polygons.length; ++j) {
            innerNode = polygons[j];

            if (j !== i && pointInPolygon(outerNode[0], innerNode)) {
                if (!innerNode.children) {
                    innerNode.children = [];
                }

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
    let parent: IPolygon = null;

    for (i = 0; i < parentCount; ++i) {
        parent = parents[i];

        if (parent.children) {
            nestPolygons(parent.children);
        }
    }
}

export function getPlacementData(binArea: number, nodes: PolygonNode[], placementsData: Float64Array): number {
    const polygon: Polygon = Polygon.create();
    const placementCount = placementsData[1];
    let placedCount: number = 0;
    let placedArea: number = 0;
    let totalArea: number = 0;
    let pathId: number = 0;
    let itemData: number = 0;
    let offset: number = 0;
    let size: number = 0;
    let i: number = 0;
    let j: number = 0;

    for (i = 0; i < placementCount; ++i) {
        totalArea += binArea;
        itemData = placementsData[2 + i];
        offset = getUint16(itemData, 1);
        size = getUint16(itemData, 0);
        placedCount += size;

        for (j = 0; j < size; ++j) {
            pathId = getUint16(placementsData[offset + j], 1);
            polygon.bind(nodes[pathId].memSeg);
            placedArea += polygon.absArea;
        }
    }

    return placedCount + placedArea / totalArea;
}

export function legacyToPolygonNode(polygon: IPolygon, children: PolygonNode[] = []): PolygonNode {
    const pointCount: number = polygon.length;
    const source: number = typeof polygon.source === 'number' ? polygon.source : -1;
    const rotation: number = polygon.rotation || 0;
    const memSeg: Float64Array = new Float64Array(pointCount << 1);
    let i: number = 0;

    for (i = 0; i < pointCount; ++i) {
        memSeg[i << 1] = polygon[i].x;
        memSeg[(i << 1) + 1] = polygon[i].y;
    }

    return { source, rotation, memSeg, children };
}

export function legacyToPolygonNodes(polygons: IPolygon[] = []): PolygonNode[] {
    const result: PolygonNode[] = [];
    const polygonCount: number = polygons.length;
    let polygon: IPolygon = null;
    let children: PolygonNode[] = null;
    let i: number = 0;

    for (i = 0; i < polygonCount; ++i) {
        polygon = polygons[i];
        children = legacyToPolygonNodes(polygon.children);
        result.push(legacyToPolygonNode(polygon, children));
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
