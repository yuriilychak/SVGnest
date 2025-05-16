import { INode } from 'svgson';

import { IPoint } from '../types';
import BasicShapeBuilder from './basic-shape-builder';

export default class PolygonBuilder extends BasicShapeBuilder {
    public getResult(): Float32Array {
        const points: IPoint[] = this.convertPointsToArray();
        const pointCount = points.length;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            this.result.push(points[i]);
        }

        return super.getResult();
    }

    public static create(element: INode, tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new PolygonBuilder(element, tolerance, svgTolerance);
    }
}
