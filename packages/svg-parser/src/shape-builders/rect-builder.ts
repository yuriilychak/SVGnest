import { getFloatAtrribute } from '../helpers';
import { IPoint } from '../types';
import BasicShapeBuilder from './basic-shape-builder';

export default class RectBuilder extends BasicShapeBuilder {
    public getResult(element: SVGElement): IPoint[] {
        const x: number = getFloatAtrribute(element, 'x');
        const y: number = getFloatAtrribute(element, 'y');
        const width: number = getFloatAtrribute(element, 'width');
        const height: number = getFloatAtrribute(element, 'height');

        this.result.push({ x, y });
        this.result.push({ x: x + width, y });
        this.result.push({ x: x + width, y: y + height });
        this.result.push({ x, y: y + height });

        return super.getResult(element);
    }

    public static create(tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new RectBuilder(tolerance, svgTolerance);
    }
}
