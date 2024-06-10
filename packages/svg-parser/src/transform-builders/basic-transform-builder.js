export default class BasicTransformBuilder {
    #transform;

    #svg;

    #svgRoot;

    #scale;

    #rotate;

    #element;

    #id;

    #className;

    constructor(element, transform, svg, svgRoot) {
        // decompose affine matrix to rotate, scale components (translate is just the 3rd column)
        const transforms = transform.toArray();
        this.#transform = transform;
        this.#svg = svg;
        this.#svgRoot = svgRoot;
        this.#scale = Math.sqrt(transforms[0] * transforms[0] + transforms[2] * transforms[2]);
        this.#rotate = Math.atan2(transforms[1], transforms[3]) * 180 / Math.PI;
        this.#element = element;
        this.#id = element.getAttribute('id');
        this.#className = element.getAttribute('class');
    }

    get transform() {
        return this.#transform;
    }

    get svg() {
        return this.#svg;
    }

    get svgRoot() {
        return this.#svgRoot;
    }

    get scale() {
        return this.#scale;
    }

    get rotate() {
        return this.#rotate;
    }

    get element() {
        return this.#element;
    }

    set element(value) {
        this.#element = value;
    }

    getResult() {
        if (this.#id) {
            this.#element.setAttribute('id', this.#id);
        }

        if (this.#className) {
            this.#element.setAttribute('class', this.#className);
        }

        return this.#element;
    }

    static create(element, transform, svg, svgRoot) {
        return new BasicTransformBuilder(element, transform, svg, svgRoot);
    }
}
