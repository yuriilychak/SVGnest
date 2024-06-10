import BasicTransformBuilder from './basic-transform-builder';

export default class PolygonBuilder extends BasicTransformBuilder {
    getResult() {
        const pointCount = this.element.points.numberOfItems;
        let transformedPoly = '';
        let i = 0;
        let point = null;
        let transformed = null;

        for (i = 0; i < pointCount; ++i) {
            point = this.element.points.getItem(i);
            transformed = this.transform.calc(point.x, point.y);
            transformedPoly = `${transformedPoly}${transformed[0]},${transformed[1]} `;
        }

        this.element.setAttribute('points', transformedPoly);
        this.element.removeAttribute('transform');

        return super.getResult();
    }

    static create(element, transform, svg, svgRoot) {
        return new PolygonBuilder(element, transform, svg, svgRoot);
    }
}
