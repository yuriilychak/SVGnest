import BasicSegment from './basic-segment';

export default class CubicSegment extends BasicSegment {
    #control1;

    #control2;

    constructor(config, tolerance) {
        super(config, tolerance);

        this.#control1 = config.control1;
        this.#control2 = config.control2;
    }

    get isFlat() {
        const ux = Math.max(
            CubicSegment.getUniform(
                this.#control1.x,
                this.point1.x,
                this.point2.x
            ),
            CubicSegment.getUniform(
                this.#control2.x,
                this.point2.x,
                this.point1.x
            )
        );
        const uy = Math.max(
            CubicSegment.getUniform(
                this.#control1.y,
                this.point1.y,
                this.point2.y
            ),
            CubicSegment.getUniform(
                this.#control2.y,
                this.point2.y,
                this.point1.y
            )
        );

        return ux + uy <= 16 * this.tolerance * this.tolerance;
    }

    subdivide() {
        const mid1 = BasicSegment.getMidPoint(this.point1, this.#control1);
        const mid2 = BasicSegment.getMidPoint(this.#control2, this.point2);
        const mid3 = BasicSegment.getMidPoint(this.#control1, this.#control2);
        const midA = BasicSegment.getMidPoint(mid1, mid3);
        const midB = BasicSegment.getMidPoint(mid3, mid2);
        const midX = BasicSegment.getMidPoint(midA, midB);

        return [
            new CubicSegment(
                {
                    point1: this.point1,
                    point2: midX,
                    control1: mid1,
                    control2: midA
                },
                this.tolerance
            ),
            new CubicSegment(
                {
                    point1: midX,
                    point2: this.point2,
                    control1: midB,
                    control2: mid2
                },
                this.tolerance
            )
        ];
    }

    static getUniform(point1, point2, point3) {
        const uniform = 3 * point1 - 2 * point2 - point3;

        return uniform * uniform;
    }

    static lineraize(data, tolerance) {
        return BasicSegment.linearizeCurve(new CubicSegment(data, tolerance));
    }
}
