import BasicShapeBuilder from './basic-shape-builder';

export default class PolygonBuilder extends BasicShapeBuilder {
    getResult(element) {
        const pointCount = element.points.numberOfItems;
        let point = null;
        let i = 0;

        for (i = 0; i < pointCount; ++i) {
            point = element.points.getItem(i);
            this.result.push({ x: point.x, y: point.y });
        }

        return super.getResult(element);
    }

    static create(tolerance, svgTolerance) {
        return new PolygonBuilder(tolerance, svgTolerance);
    }
}
