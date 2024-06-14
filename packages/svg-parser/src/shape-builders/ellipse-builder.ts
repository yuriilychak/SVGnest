import BasicShapeBuilder from './basic-shape-builder';
import { IPoint } from '../types';
import { getFloatAtrribute } from '../helpers';

export default class EllipseBuilder extends BasicShapeBuilder {
    public getResult(element: SVGElement): IPoint[] {
        const rx: number = getFloatAtrribute(element, 'rx');
        const ry: number = getFloatAtrribute(element, 'ry');
        const cx: number = getFloatAtrribute(element, 'cx');
        const cy: number = getFloatAtrribute(element, 'cy');
        const maxRadius: number = Math.max(rx, ry);
        const num: number = Math.max(Math.ceil(2 * Math.PI / Math.acos(1 - this.tolerance / maxRadius)), 3);
        const step: number = 2 * Math.PI / num;
        let i: number = 0;
        let theta: number = 0;

        for (i = 0; i < num; ++i) {
            theta = i * step;

            this.result.push({
                x: rx * Math.cos(theta) + cx,
                y: ry * Math.sin(theta) + cy
            });
        }

        return super.getResult(element);
    }

    public static create(tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new EllipseBuilder(tolerance, svgTolerance);
    }
}
