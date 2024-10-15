import { INode } from 'svgson';
import { FlattenedData, IPoint, IPolygon } from './types';

export function degreesToRadians(value: number): number {
    return (value * Math.PI) / 180;
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

export function flattenTree(
    tree: IPolygon[],
    hole: boolean,
    result: FlattenedData = { polygons: [], holes: [] }
): FlattenedData {
    const nodeCount = tree.length;
    let i = 0;
    let node: IPolygon = null;
    let children = null;

    for (i = 0; i < nodeCount; ++i) {
        node = tree[i];

        if (hole) {
            result.holes.push(node.source);
        }

        children = node.children;

        result.polygons.push(node);

        if (children && children.length > 0) {
            flattenTree(children, !hole, result);
        }
    }

    return result;
}
