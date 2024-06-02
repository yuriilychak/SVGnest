export default class BasicShapeBuilder {
    #tolerance;

    #svgTolerance;

    #result;

    constructor(tolerance, svgTolerance) {
        this.#tolerance = tolerance;
        this.#svgTolerance = svgTolerance;
        this.#result = [];
    }

    get result() {
        return this.#result;
    }

    get tolerance() {
        return this.#tolerance;
    }

    getResult(element) {
        // do not include last point if coincident with starting point
        let pointCount = this.#result.length;

        while (
            pointCount > 0 &&
            BasicShapeBuilder.almostEqual(this.#result[0].x, this.#result[pointCount - 1].x, this.#svgTolerance) &&
            BasicShapeBuilder.almostEqual(this.#result[0].y, this.#result[pointCount- 1].y, this.#svgTolerance)
        ) {
            this.#result.pop();
            --pointCount;
        }

        return this.#result;
    }
    
    static almostEqual(a, b, tolerance) {
        return Math.abs(a - b) < tolerance;
    }

    static create(tolerance, svgTolerance) {
        return new BasicShapeBuilder(tolerance, svgTolerance);
    }
}