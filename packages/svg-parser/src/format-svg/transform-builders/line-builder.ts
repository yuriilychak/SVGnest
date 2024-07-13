import { INode } from 'svgson';

import Matrix from '../matrix';
import { IPoint } from '../../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class LineBuilder extends BasicTransformBuilder {
    public getResult(): INode {
        const point1: IPoint = this.transform.calc(this.getFloatAtrribute('x1'), this.getFloatAtrribute('y1'));
        const point2: IPoint = this.transform.calc(this.getFloatAtrribute('x2'), this.getFloatAtrribute('y2'));

        this.element.attributes.x1 = point1.x.toString();
        this.element.attributes.y1 = point1.y.toString();
        this.element.attributes.x2 = point2.x.toString();
        this.element.attributes.y2 = point2.y.toString();

        return super.getResult();
    }

    public static create(element: INode, transform: Matrix): BasicTransformBuilder {
        return new LineBuilder(element, transform);
    }
}
