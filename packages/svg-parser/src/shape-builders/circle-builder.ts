import { INode } from 'svgson';

import BasicShapeBuilder from './basic-shape-builder';

export default class CircleBuilder extends BasicShapeBuilder {
    public getResult(): Float64Array {
        const radius: number = this.getFloatAtrribute('r');
        const cx: number = this.getFloatAtrribute('cx');
        const cy: number = this.getFloatAtrribute('cy');
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

        return super.getResult();
    }

    public static create(element: INode, tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new CircleBuilder(element, tolerance, svgTolerance);
    }
}
