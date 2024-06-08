import BasicSegment from './basic-segment';

export default class QuadraticSegment extends BasicSegment {
    #control;

    constructor(config, tolerance) {
        super(config, tolerance);
        this.#control = config.control;
    }

    get isFlat() {
        const ux = QuadraticSegment.getUniform(
            this.point1.x,
            this.point2.x,
            this.#control.x
        );
        const uy = QuadraticSegment.getUniform(
            this.point1.y,
            this.point2.y,
            this.#control.y
        );

        return ux + uy <= 4 * this.tolerance * this.tolerance;
    }

    // subdivide a single Bezier
    // t is the percent along the Bezier to divide at. eg. 0.5
    subdivide() {
        const mid1 = BasicSegment.getMidPoint(this.point1, this.#control);
        const mid2 = BasicSegment.getMidPoint(this.#control, this.point2);
        const mid3 = BasicSegment.getMidPoint(mid1, mid2);

        return [
            new QuadraticSegment(
                { point1: this.point1, point2: mid3, control: mid1 },
                this.tolerance
            ),
            new QuadraticSegment(
                { point1: mid3, point2: this.point2, control: mid2 },
                this.tolerance
            )
        ];
    }

    static getUniform(point1, point2, control) {
        const uniform = 2 * control - point1 - point2;

        return uniform * uniform;
    }

    static lineraize(data, tolerance) {
        return BasicSegment.linearizeCurve(
            new QuadraticSegment(data, tolerance)
        );
    }
}
