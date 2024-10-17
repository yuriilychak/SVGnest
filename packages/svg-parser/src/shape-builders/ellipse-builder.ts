import { INode } from 'svgson';

import BasicShapeBuilder from './basic-shape-builder';

export default class EllipseBuilder extends BasicShapeBuilder {
    public getResult(): Float64Array {
        const rx: number = this.getFloatAtrribute('rx');
        const ry: number = this.getFloatAtrribute('ry');
        const cx: number = this.getFloatAtrribute('cx');
        const cy: number = this.getFloatAtrribute('cy');
        const maxRadius: number = Math.max(rx, ry);
        const diameter = 2 * Math.PI;
        const num: number = Math.max(Math.ceil(diameter / Math.acos(1 - this.tolerance / maxRadius)), 3);
        const step: number = diameter / num;
        let i: number = 0;
        let theta: number = 0;

        for (i = 0; i < num; ++i) {
            theta = i * step;

            this.result.push({
                x: rx * Math.cos(theta) + cx,
                y: ry * Math.sin(theta) + cy
            });
        }

        return super.getResult();
    }

    public static create(element: INode, tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new EllipseBuilder(element, tolerance, svgTolerance);
    }
}
