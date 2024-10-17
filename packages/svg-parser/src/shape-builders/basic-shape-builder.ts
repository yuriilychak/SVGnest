import { INode } from 'svgson';

import BasicElementBuilder from '../basic-element-builder';
import { IPoint } from '../types';

export default class BasicShapeBuilder extends BasicElementBuilder {
    #tolerance: number;

    #svgTolerance: number;

    #result: IPoint[];

    protected constructor(element: INode, tolerance: number, svgTolerance: number) {
        super(element);
        this.#tolerance = tolerance;
        this.#svgTolerance = svgTolerance;
        this.#result = [];
    }

    protected get result(): IPoint[] {
        return this.#result;
    }

    protected get tolerance(): number {
        return this.#tolerance;
    }

    protected insertPoints(points: IPoint[]): void {
        const pointCount: number = points.length;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            this.result.push(points[i]);
        }
    }

    public getResult(): Float64Array {
        let pointCount: number = this.#result.length;

        while (
            pointCount > 0 &&
            BasicShapeBuilder.almostEqual(this.#result[0].x, this.#result[pointCount - 1].x, this.#svgTolerance) &&
            BasicShapeBuilder.almostEqual(this.#result[0].y, this.#result[pointCount - 1].y, this.#svgTolerance)
        ) {
            this.#result.pop();
            --pointCount;
        }

        const result: Float64Array = new Float64Array(pointCount << 1);
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result[i << 1] = this.#result[i].x;
            result[(i << 1) + 1] = this.#result[i].y;
        }

        return result;
    }

    private static almostEqual(a: number, b: number, tolerance: number): boolean {
        return Math.abs(a - b) < tolerance;
    }

    public static create(element: INode, tolerance: number, svgTolerance: number): BasicShapeBuilder {
        return new BasicShapeBuilder(element, tolerance, svgTolerance);
    }
}
