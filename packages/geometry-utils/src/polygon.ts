import Point from './point';
import { almostEqual, cycleIndex } from './shared-helpers';
import { BoundRect, IPoint, IPolygon } from './types';

export default class Polygon implements BoundRect {
    private innerPosition: Point;

    private innerSize: Point;

    private innerChildren: Polygon[];

    private data: Float64Array;

    private offset: number;

    private pointCount: number;

    private closed: boolean;

    private closedDirty: boolean;

    private tmpPoint: Point;

    private constructor() {
        this.tmpPoint = Point.zero();
        this.innerPosition = Point.zero();
        this.innerSize = Point.zero();
        this.innerChildren = [];
        this.closed = false;
    }

    public reset(points: IPoint[]): void {
        this.pointCount = points.length;
        this.data = new Float64Array((this.pointCount << 1) + 4);
        this.offset = 0;

        this.innerPosition.bind(this.data, this.pointCount << 1);
        this.innerSize.bind(this.data, (this.pointCount + 1) << 1);

        let i: number = 0;

        for (i = 0; i < this.pointCount; ++i) {
            this.tmpPoint.bind(this.data, this.offset + (i << 1));
            this.tmpPoint.update(points[i]);
        }

        this.calculateBounds();
    }

    public rotate(angle: number): void {
        const pointCount: number = this.pointCount;
        const radianAngle: number = (angle * Math.PI) / 180;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            this.at(i).rotate(radianAngle);
        }

        this.calculateBounds();
    }

    public at(index: number): Point | null {
        if (index >= this.length) {
            return null;
        }

        const pointIndex: number = cycleIndex(index, this.pointCount, 0);

        this.tmpPoint.bind(this.data, this.offset + (pointIndex << 1));

        return this.tmpPoint;
    }

    public pointIn(point: IPoint, offset: Point = null): boolean {
        if (this.isBroken) {
            return null;
        }

        const innerPoint: Point = Point.from(point);
        const currPoint: Point = Point.zero();
        const prevPoint: Point = Point.zero();
        const pointCount: number = this.pointCount;
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

        this.closedDirty = true;
    }

    public reverse(): void {
        const halfPointCount: number = this.pointCount >> 1;
        const lastIndex: number = this.pointCount - 1;
        let i: number = 0;
        let j: number = 0;
        let i2: number = 0;
        let j2: number = 0;
        let i2Plus1: number = 0;
        let j2Plus1: number = 0;

        for (i = 0; i < halfPointCount; ++i) {
            j = lastIndex - i;
            i2 = i << 1;
            j2 = j << 1;
            i2Plus1 = i2 + 1;
            j2Plus1 = j2 + 1;

            this.data[i2] = this.data[i2] + this.data[j2];
            this.data[j2] = this.data[i2] - this.data[j2];
            this.data[i2] = this.data[i2] - this.data[j2];
            this.data[i2Plus1] = this.data[i2Plus1] + this.data[j2Plus1];
            this.data[j2Plus1] = this.data[i2Plus1] - this.data[j2Plus1];
            this.data[i2Plus1] = this.data[i2Plus1] - this.data[j2Plus1];
        }
    }

    public exportLegacy(): IPoint[] {
        const result: IPoint[] = [];
        const pointCount: number = this.pointCount;
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
        this.innerSize.update(this.last);

        this.closed = this.innerPosition.almostEqual(this.innerSize);

        this.innerSize.update(this.first);

        const pointCount: number = this.pointCount;
        let i: number = 0;
        let point: Point = null;

        for (i = 1; i < pointCount; ++i) {
            point = this.at(i);
            this.innerPosition.min(point);
            this.innerSize.max(point);
        }

        this.innerSize.sub(this.innerPosition);
    }

    public get length(): number {
        const offset: number = this.closedDirty ? 1 : 0;

        return this.pointCount + offset;
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
        return this.at(cycleIndex(this.length, this.pointCount, -1));
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
        return this.closed || this.closedDirty;
    }

    public get isRectangle(): boolean {
        const pointCount: number = this.pointCount;
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
        const pointCount = this.pointCount;
        const prevPoint: Point = Point.zero();
        const currPoint: Point = Point.zero();
        let result: number = 0;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            prevPoint.update(this.at(cycleIndex(i, pointCount, -1)));
            currPoint.update(this.at(i));
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
        const result = new Polygon();

        result.reset(data);

        return result;
    }
}
