import BasicShapeBuilder from "./basic-shape-builder";

export default class RectBuilder extends BasicShapeBuilder {
    getResult(element) {
        const x = parseFloat(element.getAttribute("x")) || 0;
        const y = parseFloat(element.getAttribute("y")) || 0;
        const width = parseFloat(element.getAttribute("width")) || 0;
        const height = parseFloat(element.getAttribute("height")) || 0;

        this.result.push({ x, y });
        this.result.push({ x: x + width, y });
        this.result.push({ x: x + width, y: y + height });
        this.result.push({ x, y: y + height });

        return super.getResult(element);
    }

    static create(tolerance, svgTolerance) {
        return new RectBuilder(tolerance, svgTolerance);
    }
}