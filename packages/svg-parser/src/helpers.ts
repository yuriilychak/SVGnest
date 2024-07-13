import { INode } from 'svgson';
import { IPoint, IPolygon } from './types';

export function degreesToRadians(value: number): number {
    return (value * Math.PI) / 180;
}

const TOL = Math.pow(10, -9);

function almostEqual(a: number, b: number = 0, tolerance: number = TOL): boolean {
    return Math.abs(a - b) < tolerance;
}

// returns true if p lies on the line segment defined by AB, but not at any endpoints
// may need work!
function onSegment(point1: IPoint, point2: IPoint, p: IPoint): boolean {
    // vertical line
    if (almostEqual(point1.x, point2.x) && almostEqual(p.x, point1.x)) {
        return (
            !almostEqual(p.y, point2.y) &&
            !almostEqual(p.y, point1.y) &&
            p.y < Math.max(point2.y, point1.y) &&
            p.y > Math.min(point2.y, point1.y)
        );
    }

    // horizontal line
    if (almostEqual(point1.y, point2.y) && almostEqual(p.y, point1.y)) {
        return (
            !almostEqual(p.x, point2.x) &&
            !almostEqual(p.x, point1.x) &&
            p.x < Math.max(point2.x, point1.x) &&
            p.x > Math.min(point2.x, point1.x)
        );
    }

    // range check
    if (
        (p.x < point1.x && p.x < point2.x) ||
        (p.x > point1.x && p.x > point2.x) ||
        (p.y < point1.y && p.y < point2.y) ||
        (p.y > point1.y && p.y > point2.y)
    ) {
        return false;
    }

    // exclude end points
    if (
        (almostEqual(p.x, point1.x) && almostEqual(p.y, point1.y)) ||
        (almostEqual(p.x, point2.x) && almostEqual(p.y, point2.y))
    ) {
        return false;
    }

    const cross: number = (p.y - point1.y) * (point2.x - point1.x) - (p.x - point1.x) * (point2.y - point1.y);

    if (Math.abs(cross) > TOL) {
        return false;
    }

    const dot: number = (p.x - point1.x) * (point2.x - point1.x) + (p.y - point1.y) * (point2.y - point1.y);

    if (dot < 0 || almostEqual(dot, 0)) {
        return false;
    }

    const len2: number = (point2.x - point1.x) * (point2.x - point1.x) + (point2.y - point1.y) * (point2.y - point1.y);

    if (dot > len2 || almostEqual(dot, len2)) {
        return false;
    }

    return true;
}

// return true if point is in the polygon, false if outside, and null if exactly on a point or edge
export function pointInPolygon(point: IPoint, polygon: IPolygon): boolean {
    const pointCount: number = polygon.length;

    if (pointCount < 3) {
        return null;
    }

    let inside = false;
    let i: number = 0;
    let point1: IPoint = null;
    let point2: IPoint = null;
    let intersect: boolean = false;

    for (i = 0; i < pointCount; ++i) {
        point1 = polygon[i];
        point2 = polygon[(i - 1 + pointCount) % pointCount];

        if (almostEqual(point1.x, point.x) && almostEqual(point1.y, point.y)) {
            return false; // no result
        }

        if (onSegment(point1, point2, point)) {
            return false;
        }

        if (almostEqual(point1.x, point2.x) && almostEqual(point1.y, point2.y)) {
            continue;
        }

        intersect =
            point1.y > point.y !== point2.y > point.y &&
            point.x < ((point2.x - point1.x) * (point.y - point1.y)) / (point2.y - point1.y) + point1.x;

        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

// Main function to nest polygons
export function nestPolygons(polygons: IPolygon[], startId: number = 0): number {
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
                outerNode.parent = innerNode;
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
    let childId: number = startId + parentCount;
    let parent: IPolygon = null;

    for (i = 0; i < parentCount; ++i) {
        parent = parents[i];
        parent.id = startId + i;

        if (parent.children) {
            childId = nestPolygons(parent.children, childId);
        }
    }

    return childId;
}

// returns the area of the polygon, assuming no self-intersections
// a negative area indicates counter-clockwise winding direction
export function polygonArea(polygon: IPoint[]): number {
    const pointCount: number = polygon.length;
    let result: number = 0;
    let i: number = 0;
    let point1: IPoint = null;
    let point2: IPoint = null;

    for (i = 0; i < pointCount; ++i) {
        point1 = polygon[(i + pointCount - 1) % pointCount];
        point2 = polygon[i];
        result = result + (point1.x + point2.x) * (point1.y - point2.y);
    }

    return 0.5 * result;
}

export function convertElement(element: SVGElement): INode {
    const result: INode = {
        name: element.tagName,
        type: 'element',
        value: '',
        attributes: {},
        children: []
    };
    const nodeCount: number = element.childNodes.length;
    const attributeCount: number = element.attributes.length;
    let i: number = 0;
    let attribute: Attr = null;

    // Set attributes
    for (i = 0; i < attributeCount; ++i) {
        attribute = element.attributes.item(i);
        result.attributes[attribute.name] = attribute.value;
    }

    // Set children
    for (i = 0; i < nodeCount; ++i) {
        result.children.push(convertElement(element.childNodes.item(i) as SVGElement));
    }

    return result;
}

export function flattenTree(tree: IPolygon[], hole: boolean, result: IPolygon[] = []): IPolygon[] {
    const nodeCount = tree.length;
    let i = 0;
    let node = null;
    let children = null;

    for (i = 0; i < nodeCount; ++i) {
        node = tree[i];
        node.hole = hole;
        children = node.children;

        result.push(node);

        if (children && children.length > 0) {
            flattenTree(children, !hole, result);
        }
    }

    return result;
}
