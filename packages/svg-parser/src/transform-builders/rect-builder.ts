import { getFloatAtrribute } from '../helpers';
import Matrix from '../matrix';
import { SVG_TAG } from '../types';
import BasicTransformBuilder from './basic-transform-builder';
import PolygonBuilder from './polygon-builder';

export default class RectBuilder extends PolygonBuilder {
    public getResult(): SVGElement {
        // similar to the ellipse, we'll replace rect with polygon
        const polygon: SVGPolygonElement = this.svg.createElementNS(
            this.element.namespaceURI,
            SVG_TAG.POLYGON
        ) as SVGPolygonElement;
        const p1: DOMPoint = this.svgRoot.createSVGPoint();
        const p2: DOMPoint = this.svgRoot.createSVGPoint();
        const p3: DOMPoint = this.svgRoot.createSVGPoint();
        const p4: DOMPoint = this.svgRoot.createSVGPoint();

        p1.x = getFloatAtrribute(this.element, 'x');
        p1.y = getFloatAtrribute(this.element, 'y');

        p2.x = p1.x + getFloatAtrribute(this.element, 'width');
        p2.y = p1.y;

        p3.x = p2.x;
        p3.y = p1.y + getFloatAtrribute(this.element, 'height');

        p4.x = p1.x;
        p4.y = p3.y;

        polygon.points.appendItem(p1);
        polygon.points.appendItem(p2);
        polygon.points.appendItem(p3);
        polygon.points.appendItem(p4);

        const transformProperty: string = this.element.getAttribute('transform');

        if (transformProperty) {
            polygon.setAttribute('transform', transformProperty);
        }

        this.element.parentElement.replaceChild(polygon, this.element);
        this.element = polygon as SVGElement;

        return super.getResult();
    }

    public static create(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement): BasicTransformBuilder {
        return new RectBuilder(element, transform, svg, svgRoot);
    }
}
