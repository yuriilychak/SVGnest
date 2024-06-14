import { IPoint } from '../../../types';
import { IBasicSegmentData } from '../types';

export default class BasicSegment {
    #points: IPoint[];
    #tolerance: number;

    protected constructor({ point1, point2 }: IBasicSegmentData, tolerance: number) {
        this.#points = [point1, point2];
        this.#tolerance = tolerance;
    }

    protected get point1(): IPoint {
        return this.#points[0];
    }

    protected get point2(): IPoint {
        return this.#points[1];
    }

    protected get tolerance(): number {
        return this.#tolerance;
    }

    protected get isFlat(): boolean {
        return false;
    }

    protected subdivide(): BasicSegment[] {
        return [];
    }

    protected export(index: number): IPoint {
        const point = this.#points[index];

        return { x: point.x, y: point.y };
    }

    protected static getMidPoint(point1: IPoint, point2: IPoint): IPoint {
        return {
            x: (point1.x + point2.x) * 0.5,
            y: (point1.y + point2.y) * 0.5
        };
    }

    protected static linearizeCurve(instance: BasicSegment): IPoint[] {
        const result: IPoint[] = []; // list of points to return
        const todo: BasicSegment[] = [instance]; // list of Beziers to divide
        let segment: BasicSegment;
        let divided: BasicSegment[];

        // recursion could stack overflow, loop instead

        while (todo.length > 0) {
            segment = todo[0];

            if (segment.isFlat) {
                // reached subdivision limit
                result.push(segment.export(1));
                todo.shift();
            } else {
                divided = segment.subdivide();
                todo.splice(0, 1, ...divided);
            }
        }

        return result;
    }

    public static lineraize(data: IBasicSegmentData, tolerance: number): IPoint[] {
        return BasicSegment.linearizeCurve(new BasicSegment(data, tolerance));
    }
}
