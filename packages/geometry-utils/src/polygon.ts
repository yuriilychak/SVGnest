import Point from './point';
import { almostEqual, cycleIndex } from './shared-helpers';
import { BoundRect, IPoint, IPolygon } from './types';

export default class Polygon implements BoundRect {
    private points: Point[];

    private innerX: number;

    private innerY: number;

    private innerWidth: number;

    private innerHeight: number;

    private innerChildren: Polygon[];

    private constructor(points: Point[] = []) {
        this.points = points;
        this.innerChildren = [];
        this.calculateBounds();
    }

    public rotate(angle: number): void {
        const pointCount: number = this.length;
        const radianAngle: number = (angle * Math.PI) / 180;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            this.points[i].rotate(radianAngle);
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

    private calculateBounds(): void {
        if (this.isBroken) {
            return;
        }

        const pointCount: number = this.length;
        const min: Point = Point.from(this.first);
        const size: Point = Point.from(this.first);
        let i: number = 0;

        for (i = 1; i < pointCount; ++i) {
            min.min(this.at(i));
            size.max(this.at(i));
        }

        size.sub(min);

        this.innerX = min.x;
        this.innerY = min.y;
        this.innerWidth = size.x;
        this.innerHeight = size.y;
    }

    public get length(): number {
        return this.points.length;
    }

    public get x(): number {
        return this.innerX;
    }

    public get y(): number {
        return this.innerY;
    }

    public get width(): number {
        return this.innerWidth;
    }

    public get height(): number {
        return this.innerHeight;
    }

    public get first(): Point {
        return this.points[0];
    }

    public get children(): Polygon[] {
        return this.innerChildren;
    }

    public get childrCount(): number {
        return this.innerChildren.length;
    }

    public get hasChildren(): boolean {
        return this.innerChildren.length !== 0;
    }

    public get isBroken(): boolean {
        return this.points.length < 3;
    }

    public get isClosed(): boolean {
        return this.points[0].almostEqual(this.points[this.length - 1]);
    }

    public get isRectangle(): boolean {
        const pointCount: number = this.length;
        const rightX: number = this.innerX + this.innerWidth;
        const bottomY: number = this.innerY + this.innerHeight;
        let point: Point = null;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            point = this.at(i);

            if (
                !(
                    (almostEqual(point.x, this.innerX) || almostEqual(point.x, rightX)) &&
                    (almostEqual(point.y, this.innerY) || almostEqual(point.y, bottomY))
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
