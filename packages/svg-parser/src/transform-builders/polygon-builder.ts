import Matrix from '../matrix';
import { IPoint } from '../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class PolygonBuilder extends BasicTransformBuilder {
    public getResult(): SVGElement {
        const points: SVGPointList = (this.element as SVGPolygonElement).points;
        const pointCount = points.numberOfItems;
        let transformedPoly: string = '';
        let i: number = 0;
        let point: DOMPoint;
        let transformed: IPoint;

        for (i = 0; i < pointCount; ++i) {
            point = points.getItem(i);
            transformed = this.transform.calc(point.x, point.y);
            transformedPoly = `${transformedPoly}${transformed.x},${transformed.y} `;
        }

        this.element.setAttribute('points', transformedPoly);
        this.element.removeAttribute('transform');

        return super.getResult();
    }

    public static create(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement): BasicTransformBuilder {
        return new PolygonBuilder(element, transform, svg, svgRoot);
    }
}
