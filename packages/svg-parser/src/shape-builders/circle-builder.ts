import { getFloatAtrribute } from '../helpers';
import { IPoint } from '../types';
import BasicShapeBuilder from './basic-shape-builder';

export default class CircleBuilder extends BasicShapeBuilder {
    public getResult(element: SVGElement): IPoint[] {
        const radius: number = getFloatAtrribute(element, 'r');
        const cx: number = getFloatAtrribute(element, 'cx');
        const cy: number = getFloatAtrribute(element, 'cy');
        // num is the smallest number of segments required to approximate the circle to the given tolerance
        const diameter: number = 2 * Math.PI;
        const num: number = Math.max(Math.ceil(diameter / Math.acos(1 - this.tolerance / radius)), 3);
        const step: number = diameter / num;
        let i: number = 0;
        let theta: number = 0;

        for (i = 0; i < num; ++i) {
            theta = i * step;
            this.result.push({
                x: radius * Math.cos(theta) + cx,
                y: radius * Math.sin(theta) + cy
            });
        }

        return super.getResult(element);
    }

    public static create(tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new CircleBuilder(tolerance, svgTolerance);
    }
}
