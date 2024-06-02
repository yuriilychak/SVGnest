import BasicShapeBuilder from "./basic-shape-builder";

export default class CircleBuilder extends BasicShapeBuilder {
    getResult(element) {
        const radius = parseFloat(element.getAttribute("r"));
        const cx = parseFloat(element.getAttribute("cx"));
        const cy = parseFloat(element.getAttribute("cy"));
        // num is the smallest number of segments required to approximate the circle to the given tolerance
        const num = Math.max(Math.ceil(
          (2 * Math.PI) / Math.acos(1 - this.tolerance / radius)
        ), 3);
        const step = (2 * Math.PI) / num;
        let i = 0;
        let theta = 0;

        for (i = 0; i < num; ++i) {
          theta = i * step;
          this.result.push({
            x: radius * Math.cos(theta) + cx,
            y: radius * Math.sin(theta) + cy
          });
        }

        return super.getResult(element);
    }

    static create(tolerance, svgTolerance) {
        return new CircleBuilder(tolerance, svgTolerance);
    }
}