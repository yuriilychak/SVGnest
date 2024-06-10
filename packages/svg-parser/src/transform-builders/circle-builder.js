import BasicTransformBuilder from './basic-transform-builder';

export default class CircleBuilder extends BasicTransformBuilder {
    getResult() {
        const [cx, cy] = this.transform.calc(this.element.getAttribute('cx'), this.element.getAttribute('cy'));

        this.element.setAttribute('cx', cx);
        this.element.setAttribute('cy', cy);

        // skew not supported
        this.element.setAttribute('r', this.element.getAttribute('r') * this.scale);

        return super.getResult();
    }

    static create(element, transform, svg, svgRoot) {
        return new CircleBuilder(element, transform, svg, svgRoot);
    }
}
