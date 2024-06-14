import { getFloatAtrribute } from '../helpers';
import Matrix from '../matrix';
import { IPoint } from '../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class LineBuilder extends BasicTransformBuilder {
    public getResult(): SVGElement {
        const point1: IPoint = this.transform.calc(getFloatAtrribute(this.element, 'x1'), getFloatAtrribute(this.element, 'y1'));
        const point2: IPoint = this.transform.calc(getFloatAtrribute(this.element, 'x2'), getFloatAtrribute(this.element, 'y2'));

        this.element.setAttribute('x1', point1.x.toString());
        this.element.setAttribute('y1', point1.y.toString());
        this.element.setAttribute('x2', point2.x.toString());
        this.element.setAttribute('y2', point2.y.toString());

        return super.getResult();
    }

    public static create(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement): BasicTransformBuilder {
        return new LineBuilder(element, transform, svg, svgRoot);
    }
}
