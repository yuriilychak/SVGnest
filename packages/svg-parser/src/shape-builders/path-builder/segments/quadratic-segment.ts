import BasicSegment from './basic-segment';
import { IBasicSegmentData, IQuadraticSegmentData } from '../types';
import { IPoint } from '../../../types';

export default class QuadraticSegment extends BasicSegment {
    #control: IPoint;

    protected constructor(config: IQuadraticSegmentData, tolerance: number) {
        super(config, tolerance);
        this.#control = config.control;
    }

    protected get isFlat(): boolean {
        const ux: number = QuadraticSegment.getUniform(this.point1.x, this.point2.x, this.#control.x);
        const uy: number = QuadraticSegment.getUniform(this.point1.y, this.point2.y, this.#control.y);

        return ux + uy <= 4 * this.tolerance * this.tolerance;
    }

    // subdivide a single Bezier
    // t is the percent along the Bezier to divide at. eg. 0.5
    protected subdivide(): BasicSegment[] {
        const mid1: IPoint = BasicSegment.getMidPoint(this.point1, this.#control);
        const mid2: IPoint = BasicSegment.getMidPoint(this.#control, this.point2);
        const mid3: IPoint = BasicSegment.getMidPoint(mid1, mid2);

        return [
            new QuadraticSegment({ point1: this.point1, point2: mid3, control: mid1 }, this.tolerance),
            new QuadraticSegment({ point1: mid3, point2: this.point2, control: mid2 }, this.tolerance)
        ];
    }

    private static getUniform(point1: number, point2: number, control: number): number {
        const uniform: number = 2 * control - point1 - point2;

        return uniform * uniform;
    }

    public static lineraize(data: IBasicSegmentData, tolerance: number): IPoint[] {
        return BasicSegment.linearizeCurve(new QuadraticSegment(data as IQuadraticSegmentData, tolerance));
    }
}
