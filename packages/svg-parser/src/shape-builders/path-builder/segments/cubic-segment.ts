import BasicSegment from './basic-segment';
import { IBasicSegmentData, ICubicSegmentData } from '../types';
import { IPoint } from '../../../types';

export default class CubicSegment extends BasicSegment {
    #control1: IPoint;
    #control2: IPoint;

    constructor(config: ICubicSegmentData, tolerance: number) {
        super(config, tolerance);

        this.#control1 = config.control1;
        this.#control2 = config.control2;
    }

    protected get isFlat(): boolean {
        const ux: number = Math.max(
            CubicSegment.getUniform(this.#control1.x, this.point1.x, this.point2.x),
            CubicSegment.getUniform(this.#control2.x, this.point2.x, this.point1.x)
        );
        const uy: number = Math.max(
            CubicSegment.getUniform(this.#control1.y, this.point1.y, this.point2.y),
            CubicSegment.getUniform(this.#control2.y, this.point2.y, this.point1.y)
        );

        return ux + uy <= 16 * this.tolerance * this.tolerance;
    }

    protected subdivide(): BasicSegment[] {
        const mid1: IPoint = BasicSegment.getMidPoint(this.point1, this.#control1);
        const mid2: IPoint = BasicSegment.getMidPoint(this.#control2, this.point2);
        const mid3: IPoint = BasicSegment.getMidPoint(this.#control1, this.#control2);
        const midA: IPoint = BasicSegment.getMidPoint(mid1, mid3);
        const midB: IPoint = BasicSegment.getMidPoint(mid3, mid2);
        const midX: IPoint = BasicSegment.getMidPoint(midA, midB);

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

    private static getUniform(point1: number, point2: number, point3: number): number {
        const uniform: number = 3 * point1 - 2 * point2 - point3;

        return uniform * uniform;
    }

    public static lineraize(data: IBasicSegmentData, tolerance: number): IPoint[] {
        return BasicSegment.linearizeCurve(new CubicSegment(data as ICubicSegmentData, tolerance));
    }
}
