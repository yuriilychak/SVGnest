import PolygonBuilder from './polygon-builder';

export default class RectBuilder extends PolygonBuilder {
    getResult() {
        // similar to the ellipse, we'll replace rect with polygon
        const polygon = this.svg.createElementNS(this.element.namespaceURI, 'polygon');
        const p1 = this.svgRoot.createSVGPoint();
        const p2 = this.svgRoot.createSVGPoint();
        const p3 = this.svgRoot.createSVGPoint();
        const p4 = this.svgRoot.createSVGPoint();

        p1.x = parseFloat(this.element.getAttribute('x')) || 0;
        p1.y = parseFloat(this.element.getAttribute('y')) || 0;

        p2.x = p1.x + parseFloat(this.element.getAttribute('width'));
        p2.y = p1.y;

        p3.x = p2.x;
        p3.y = p1.y + parseFloat(this.element.getAttribute('height'));

        p4.x = p1.x;
        p4.y = p3.y;

        polygon.points.appendItem(p1);
        polygon.points.appendItem(p2);
        polygon.points.appendItem(p3);
        polygon.points.appendItem(p4);

        const transformProperty = this.element.getAttribute('transform');

        if (transformProperty) {
            polygon.setAttribute('transform', transformProperty);
        }

        this.element.parentElement.replaceChild(polygon, this.element);
        this.element = polygon;

        return super.getResult();
    }

    static create(element, transform, svg, svgRoot) {
        return new RectBuilder(element, transform, svg, svgRoot);
    }
}
