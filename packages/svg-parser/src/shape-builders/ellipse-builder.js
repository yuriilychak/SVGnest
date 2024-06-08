import BasicShapeBuilder from './basic-shape-builder';

export default class EllipseBuilder extends BasicShapeBuilder {
    getResult(element) {
        const rx = parseFloat(element.getAttribute('rx'));
        const ry = parseFloat(element.getAttribute('ry'));
        const cx = parseFloat(element.getAttribute('cx'));
        const cy = parseFloat(element.getAttribute('cy'));
        const maxRadius = Math.max(rx, ry);
        const num = Math.max(
            Math.ceil(
                2 * Math.PI / Math.acos(1 - this.tolerance / maxRadius)
            ),
            3
        );
        const step = 2 * Math.PI / num;
        let i = 0;
        let theta = 0;

        for (i = 0; i < num; ++i) {
            theta = i * step;

            this.result.push({
                x: rx * Math.cos(theta) + cx,
                y: ry * Math.sin(theta) + cy
            });
        }

        return super.getResult(element);
    }

    static create(tolerance, svgTolerance) {
        return new EllipseBuilder(tolerance, svgTolerance);
    }
}
