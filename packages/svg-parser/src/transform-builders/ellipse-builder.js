import BasicTransformBuilder from './basic-transform-builder';

export default class EllipseBuilder extends BasicTransformBuilder {
    getResult() {
        // the goal is to remove the transform property, but an ellipse without a transform will have no rotation
        // for the sake of simplicity, we will replace the ellipse with a path, and apply the transform to that path
        const path = this.svg.createElementNS(this.element.namespaceURI, 'path');
        const cx = this.element.getAttribute('cx');
        const cy = this.element.getAttribute('cy');
        const rx = this.element.getAttribute('rx');
        const ry = this.element.getAttribute('ry');
        const cNumX = parseFloat(cx);
        const rNumX = parseFloat(rx);
        const move = path.createSVGPathSegMovetoAbs(cNumX - rNumX, cy);
        const arc1 = path.createSVGPathSegArcAbs(cNumX + rNumX, cy, rx, ry, 0, 1, 0);
        const arc2 = path.createSVGPathSegArcAbs(cNumX - rNumX, cy, rx, ry, 0, 1, 0);

        path.pathSegList.appendItem(move);
        path.pathSegList.appendItem(arc1);
        path.pathSegList.appendItem(arc2);
        path.pathSegList.appendItem(path.createSVGPathSegClosePath());

        const transformProperty = this.element.getAttribute('transform');

        if (transformProperty) {
            path.setAttribute('transform', transformProperty);
        }

        this.element.parentElement.replaceChild(path, this.element);
        this.element = path;

        return super.getResult();
    }

    static create(element, transform, svg, svgRoot) {
        return new EllipseBuilder(element, transform, svg, svgRoot);
    }
}
