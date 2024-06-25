import { IPoint } from '../types';
import BasicShapeBuilder from './basic-shape-builder';

export default class PolygonBuilder extends BasicShapeBuilder {
    public getResult(element: SVGElement): IPoint[] {
        const points: SVGPointList = (element as SVGPolygonElement).points;
        const pointCount = points.numberOfItems;
        let point: IPoint = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = points.getItem(i);
            this.result.push({ x: point.x, y: point.y });
        }

        return super.getResult(element);
    }

    public static create(tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new PolygonBuilder(tolerance, svgTolerance);
    }
}
