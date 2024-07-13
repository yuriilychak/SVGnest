import { INode } from 'svgson';

import Matrix from '../matrix';
import { IPoint } from '../../types';
import BasicTransformBuilder from './basic-transform-builder';

export default class CircleBuilder extends BasicTransformBuilder {
    public getResult(): INode {
        const transformed: IPoint = this.transform.calc(this.getFloatAtrribute('cx'), this.getFloatAtrribute('cy'));

        this.element.attributes.cx = transformed.x.toString();
        this.element.attributes.cy = transformed.y.toString();

        const radius: number = this.getFloatAtrribute('r') * this.scale;
        // skew not supported
        this.element.attributes.r = radius.toString();

        return super.getResult();
    }

    static create(element: INode, transform: Matrix): BasicTransformBuilder {
        return new CircleBuilder(element, transform);
    }
}
