import { INode } from 'svgson';

import Matrix from '../matrix';
import { IPoint, SVG_TAG } from '../../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class RectBuilder extends BasicTransformBuilder {
    public getResult(): INode {
        const x: number = this.getFloatAtrribute('x');
        const y: number = this.getFloatAtrribute('y');
        const width: number = this.getFloatAtrribute('width');
        const height: number = this.getFloatAtrribute('height');
        const points: IPoint[] = [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height }
        ];

        const pointCount: number = points.length;
        let point: IPoint = null;
        let transformed: IPoint = null;
        let i: number = 0;
        let transformedPoly: string = '';

        for (i = 0; i < pointCount; ++i) {
            point = points[i];
            transformed = this.transform.calc(point.x, point.y);
            transformedPoly = `${transformedPoly}${transformed.x},${transformed.y} `;
        }

        this.element.name = SVG_TAG.POLYGON;
        this.element.attributes.points = transformedPoly;

        return super.getResult();
    }

    public static create(element: INode, transform: Matrix): BasicTransformBuilder {
        return new RectBuilder(element, transform);
    }
}
