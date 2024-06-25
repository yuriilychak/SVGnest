import Matrix from '../matrix';

export default class BasicTransformBuilder {
    #transform: Matrix;

    #svg: Document;

    #svgRoot: SVGSVGElement;

    #scale: number;

    #rotate: number;

    #element: SVGElement;

    #id: string;

    #className: string;

    protected constructor(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement) {
        // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
        const transforms: number[] = transform.toArray();
        this.#transform = transform;
        this.#svg = svg;
        this.#svgRoot = svgRoot;
        this.#scale = Math.sqrt(transforms[0] * transforms[0] + transforms[2] * transforms[2]);
        this.#rotate = (Math.atan2(transforms[1], transforms[3]) * 180) / Math.PI;
        this.#element = element;
        this.#id = element.getAttribute('id');
        this.#className = element.getAttribute('class');
    }

    protected get transform(): Matrix {
        return this.#transform;
    }

    protected get svg(): Document {
        return this.#svg;
    }

    protected get svgRoot(): SVGSVGElement {
        return this.#svgRoot;
    }

    protected get scale(): number {
        return this.#scale;
    }

    protected get rotate(): number {
        return this.#rotate;
    }

    protected get element(): SVGElement {
        return this.#element;
    }

    protected set element(value: SVGElement) {
        this.#element = value;
    }

    public getResult(): SVGElement {
        if (this.#id) {
            this.#element.setAttribute('id', this.#id);
        }

        if (this.#className) {
            this.#element.setAttribute('class', this.#className);
        }

        return this.#element;
    }

    public static create(element: SVGElement, transform: Matrix, svg: Document, svgRoot: SVGSVGElement): BasicTransformBuilder {
        return new BasicTransformBuilder(element, transform, svg, svgRoot);
    }
}
