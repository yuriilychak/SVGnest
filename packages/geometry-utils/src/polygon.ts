import Point from './point';
import { almostEqual, cycleIndex } from './shared-helpers';
import { BoundRect, IPoint, IPolygon } from './types';

export default class Polygon implements BoundRect {
    private innerPosition: Point;

    private innerSize: Point;

    private points: Point[];

    private innerChildren: Polygon[];

    private constructor(points: Point[] = []) {
        this.points = points;
        this.innerPosition = Point.zero();
        this.innerSize = Point.zero();
        this.innerChildren = [];
        this.calculateBounds();
    }

    public rotate(angle: number): void {
        const pointCount: number = this.length;
        const radianAngle: number = (angle * Math.PI) / 180;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            this.at(i).rotate(radianAngle);
        }

        this.calculateBounds();
    }

    public at(index: number): Point | null {
        return index >= this.length ? null : this.points[index];
    }

    public pointIn(point: IPoint, offset: Point = null): boolean {
        if (this.isBroken) {
            return null;
        }

        const innerPoint: Point = Point.from(point);
        const currPoint: Point = Point.zero();
        const prevPoint: Point = Point.zero();
        const pointCount: number = this.length;
        let inside: boolean = false;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            currPoint.update(this.at(i));
            prevPoint.update(this.at(cycleIndex(i, pointCount, -1)));

            if (offset !== null) {
                currPoint.add(offset);
                prevPoint.add(offset);
            }

            //  no result                            exactly on the segment
            if (currPoint.almostEqual(innerPoint) || innerPoint.onSegment(currPoint, prevPoint)) {
                return null;
            }

            if (currPoint.almostEqual(prevPoint)) {
                // ignore very small lines
                continue;
            }

            if (
                currPoint.y > innerPoint.y !== prevPoint.y > innerPoint.y &&
                innerPoint.x < innerPoint.interpolateX(prevPoint, currPoint)
            ) {
                inside = !inside;
            }
        }

        return inside;
    }
    public close(): void {
        if (this.isClosed) {
            return;
        }

        this.points.push(this.first);
    }

    public reverse(): void {
        this.points.reverse();
    }

    public exportLegacy(): IPoint[] {
        const result: IPoint[] = [];
        const pointCount: number = this.length;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            result.push(this.at(i).export());
        }

        return result;
    }

    private calculateBounds(): void {
        if (this.isBroken) {
            return;
        }

        this.innerPosition.update(this.first);
        this.innerSize.update(this.first);

        const pointCount: number = this.length;
        let i: number = 0;

        for (i = 1; i < pointCount; ++i) {
            this.innerPosition.min(this.at(i));
            this.innerSize.max(this.at(i));
        }

        this.innerSize.sub(this.innerPosition);
    }

    public get length(): number {
        return this.points.length;
    }

    public get x(): number {
        return this.innerPosition.x;
    }

    public get y(): number {
        return this.innerPosition.y;
    }

    public get width(): number {
        return this.innerSize.x;
    }

    public get height(): number {
        return this.innerSize.y;
    }

    public get first(): Point {
        return this.at(0);
    }

    public get last(): Point {
        return this.at(this.length - 1);
    }

    public get children(): Polygon[] {
        return this.innerChildren;
    }

    public get childrCount(): number {
        return this.innerChildren.length;
    }

    public get hasChildren(): boolean {
        return this.childrCount !== 0;
    }

    public get isBroken(): boolean {
        return this.length < 3;
    }

    public get isClosed(): boolean {
        return this.first.almostEqual(this.last);
    }

    public get isRectangle(): boolean {
        const pointCount: number = this.length;
        const right: Point = Point.from(this.innerPosition).add(this.innerSize);
        let point: Point = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = this.at(i);

            if (
                !(
                    (almostEqual(point.x, this.innerPosition.x) || almostEqual(point.x, right.x)) &&
                    (almostEqual(point.y, this.innerPosition.y) || almostEqual(point.y, right.y))
                )
            ) {
                return false;
            }
        }

        return true;
    }

    // returns the area of the polygon, assuming no self-intersections
    // a negative area indicates counter-clockwise winding direction
    public get area(): number {
        const pointCount = this.length;
        let prevPoint: Point = null;
        let currPoint: Point = null;
        let result: number = 0;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            prevPoint = this.at(cycleIndex(i, pointCount, -1));
            currPoint = this.at(i);
            result += (prevPoint.x + currPoint.x) * (prevPoint.y - currPoint.y);
        }

        return 0.5 * result;
    }

    public get position(): Point {
        return this.innerPosition;
    }

    public get size(): Point {
        return this.innerSize;
    }

    public static fromLegacy(data: IPolygon | IPoint[]): Polygon {
        const points: Point[] = [];
        const pointCount: number = data.length;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            points.push(Point.from(data[i]));
        }

        return new Polygon(points);
    }
}
