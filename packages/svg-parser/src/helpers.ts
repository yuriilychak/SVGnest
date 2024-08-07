import { INode } from 'svgson';
import { IPoint, IPolygon } from './types';

export function degreesToRadians(value: number): number {
    return (value * Math.PI) / 180;
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
