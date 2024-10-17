import { INode } from 'svgson';

import BasicShapeBuilder from './basic-shape-builder';

export default class RectBuilder extends BasicShapeBuilder {
    public getResult(): Float64Array {
        const x: number = this.getFloatAtrribute('x');
        const y: number = this.getFloatAtrribute('y');
        const width: number = this.getFloatAtrribute('width');
        const height: number = this.getFloatAtrribute('height');

        this.result.push({ x, y });
        this.result.push({ x: x + width, y });
        this.result.push({ x: x + width, y: y + height });
        this.result.push({ x, y: y + height });

        return super.getResult();
    }

    public static create(element: INode, tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new RectBuilder(element, tolerance, svgTolerance);
    }
}
