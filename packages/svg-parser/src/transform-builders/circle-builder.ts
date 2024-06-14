import { getFloatAtrribute } from '../helpers';
import Matrix from '../matrix';
import { IPoint } from '../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class CircleBuilder extends BasicTransformBuilder {
    public getResult(): SVGElement {
        const transformed: IPoint = this.transform.calc(
            getFloatAtrribute(this.element, 'cx'),
            getFloatAtrribute(this.element, 'cy')
        );

        this.element.setAttribute('cx', transformed.x.toString());
        this.element.setAttribute('cy', transformed.y.toString());

        const radius: number = getFloatAtrribute(this.element, 'r') * this.scale;
        // skew not supported
        this.element.setAttribute('r', radius.toString());

        return super.getResult();
    }

    static create(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement): BasicTransformBuilder {
        return new CircleBuilder(element, transform, svg, svgRoot);
    }
}
