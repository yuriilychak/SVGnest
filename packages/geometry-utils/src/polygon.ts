import Point from './point';
import { almostEqual, cycleIndex } from './shared-helpers';
import { IPoint, IPolygon } from './types';

export default class Polygon {
    private innerChildren: Polygon[];

    private data: Float64Array;

    private offset: number;

    private pointCount: number;

    private closed: boolean;

    private closedDirty: boolean;

    private tmpPoint: Point;

    private rectangle: boolean;

    private rectData: Float64Array;

    private constructor() {
        this.tmpPoint = Point.zero();
        this.innerChildren = [];
        this.rectData = new Float64Array(4);
        this.closed = false;
        this.pointCount = 0;
        this.offset = 0;
        this.rectangle = false;
    }

    public reset(points: IPoint[]): void {
        this.pointCount = points.length;
        this.offset = 0;
        this.data = new Float64Array(this.getPointOffset(this.pointCount + 2));

        let i: number = 0;

        for (i = 0; i < this.pointCount; ++i) {
            this.tmpPoint.bind(this.data, this.getPointOffset(i)).update(points[i]);
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

        return this.tmpPoint.bind(this.data, this.getPointOffset(pointIndex));
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
            i2 = this.offset + (i << 1);
            j2 = this.offset + (j << 1);
            i2Plus1 = this.offset + i2 + 1;
            j2Plus1 = this.offset + j2 + 1;

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

    private getPointOffset(index: number): number {
        return this.offset + (index << 1);
    }

    private calculateBounds(): void {
        if (this.isBroken) {
            return;
        }

        const point1: Point = Point.from(this.first);
        const point2: Point = Point.from(this.last);

        this.closed = point1.almostEqual(point2);

        const pointCount: number = this.pointCount;
        let i: number = 0;
        let point: Point = null;

        for (i = 0; i < pointCount; ++i) {
            point = this.at(i);
            point1.min(point);
            point2.max(point);
        }

        this.rectangle = true;

        for (i = 0; i < this.pointCount; ++i) {
            point = this.at(i);

            if (
                !(
                    (almostEqual(point.x, point1.x) || almostEqual(point.x, point2.x)) &&
                    (almostEqual(point.y, point1.y) || almostEqual(point.y, point2.y))
                )
            ) {
                this.rectangle = false;
                break;
            }
        }

        point2.sub(point1);

        this.tmpPoint.bind(this.rectData, 0).update(point1);
        this.tmpPoint.bind(this.rectData, 2).update(point2);
    }

    public get length(): number {
        const offset: number = this.closedDirty ? 1 : 0;

        return this.pointCount + offset;
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
        return this.rectangle;
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
        return this.tmpPoint.bind(this.rectData, 0);
    }

    public get size(): Point {
        return this.tmpPoint.bind(this.rectData, 2);
    }

    public static fromLegacy(data: IPolygon | IPoint[]): Polygon {
        const result = new Polygon();

        result.reset(data);

        return result;
    }
}
