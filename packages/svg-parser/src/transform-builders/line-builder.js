import BasicTransformBuilder from './basic-transform-builder';

export default class LineBuilder extends BasicTransformBuilder {
    getResult() {
        const [x1, y1] = this.transform.calc(this.element.getAttribute('x1'), this.element.getAttribute('y1'));
        const [x2, y2] = this.transform.calc(this.element.getAttribute('x2'), this.element.getAttribute('y2'));

        this.element.setAttribute('x1', x1.toString());
        this.element.setAttribute('y1', y1.toString());
        this.element.setAttribute('x2', x2.toString());
        this.element.setAttribute('y2', y2.toString());

        return super.getResult();
    }

    static create(element, transform, svg, svgRoot) {
        return new LineBuilder(element, transform, svg, svgRoot);
    }
}
