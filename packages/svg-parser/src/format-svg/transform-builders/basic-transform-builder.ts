import { INode } from 'svgson';
import Matrix from '../matrix';
import BasicElementBuilder from '../../basic-element-builder';

export default class BasicTransformBuilder extends BasicElementBuilder {
    #transform: Matrix;

    #scale: number;

    #rotate: number;

    #id: string;

    #className: string;

    protected constructor(element: INode, transform: Matrix) {
        super(element);
        // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
        const transforms: number[] = transform.toArray();
        const atan: number = Math.atan2(transforms[1], transforms[3]) * 180;
        this.#transform = transform;
        this.#scale = Math.sqrt(transforms[0] * transforms[0] + transforms[2] * transforms[2]);
        this.#rotate = atan / Math.PI;
        this.#id = element.attributes.id;
        this.#className = element.attributes.class;
    }
    protected getFloatAtrribute(key: string): number {
        return parseFloat(this.element.attributes[key]) || 0;
    }

    protected get transform(): Matrix {
        return this.#transform;
    }

    protected get scale(): number {
        return this.#scale;
    }

    protected get rotate(): number {
        return this.#rotate;
    }

    public getResult(): INode {
        if (this.#id) {
            this.element.attributes.id = this.#id;
        }

        if (this.#className) {
            this.element.attributes.class = this.#className;
        }

        delete this.element.attributes.transform;

        return this.element;
    }

    public static create(element: INode, transform: Matrix): BasicTransformBuilder {
        return new BasicTransformBuilder(element, transform);
    }
}
