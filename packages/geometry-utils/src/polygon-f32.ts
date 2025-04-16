import { almostEqual, cycleIndex, getUint16, readUint32FromF32 } from './helpers';
import { NFP_INFO_START_INDEX } from './constants';
import PointF32 from './point-f32';
import BoundRectF32 from './bound-rect-f32';

export default class PolygonF32 {
    private memSeg: Float32Array;

    private offset: number;

    private pointCount: number;

    private closed: boolean;

    private closedDirty: boolean;

    private point: PointF32;

    private rectangle: boolean;

    private bounds: BoundRectF32;

    private constructor() {
        this.point = PointF32.zero();
        this.closed = false;
        this.pointCount = 0;
        this.offset = 0;
        this.rectangle = false;
        this.bounds = new BoundRectF32();
    }

    public bind(data: Float32Array, offset: number = 0, pointCount: number = data.length >> 1): void {
        this.closedDirty = false;
        this.rectangle = false;
        this.closed = false;
        this.pointCount = 0;
        this.offset = 0;
        this.pointCount = pointCount;
        this.offset = offset;
        this.memSeg = data;

        this.calculateBounds();
    }

    public bindNFP(memSeg: Float32Array, index: number): void {
        const compressedInfo: number = readUint32FromF32(memSeg, NFP_INFO_START_INDEX + index);
        const offset: number = getUint16(compressedInfo, 1);
        const size: number = getUint16(compressedInfo, 0) >>> 1;

        this.bind(memSeg, offset, size);
    }

    public clean(): void {
        this.closedDirty = false;
        this.rectangle = false;
        this.closed = false;
        this.pointCount = 0;
        this.offset = 0;
        this.memSeg = null;
        this.point.bind(null);
    }

    public rotate(angle: number): void {
        const pointCount: number = this.pointCount;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            this.at(i).rotate(angle);
        }

        this.calculateBounds();
    }

    public at(index: number): PointF32 | null {
        if (index >= this.length) {
            return null;
        }

        const pointIndex: number = cycleIndex(index, this.pointCount, 0);

        return this.point.bind(this.memSeg, this.getPointOffset(pointIndex));
    }

    public pointIn(point: PointF32, offset: PointF32 = null): boolean {
        if (this.isBroken) {
            return null;
        }

        const innerPoint: PointF32 = PointF32.from(point);
        const currPoint: PointF32 = PointF32.zero();
        const prevPoint: PointF32 = PointF32.zero();
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

            this.memSeg[i2] = this.memSeg[i2] + this.memSeg[j2];
            this.memSeg[j2] = this.memSeg[i2] - this.memSeg[j2];
            this.memSeg[i2] = this.memSeg[i2] - this.memSeg[j2];
            this.memSeg[i2Plus1] = this.memSeg[i2Plus1] + this.memSeg[j2Plus1];
            this.memSeg[j2Plus1] = this.memSeg[i2Plus1] - this.memSeg[j2Plus1];
            this.memSeg[i2Plus1] = this.memSeg[i2Plus1] - this.memSeg[j2Plus1];
        }
    }

    public exportBounds(): BoundRectF32 {
        return this.bounds.clone();
    }

    public resetPosition(): void {
        const position: PointF32 = PointF32.from(this.position);
        const binSize = this.length;
        let i: number = 0;

        for (i = 0; i < binSize; ++i) {
            this.at(i).sub(position);
        }

        this.calculateBounds();
    }

    // remove duplicate endpoints, ensure counterclockwise winding direction
    public normalize(): Float32Array {
        let pointCount: number = this.pointCount;
        const first: PointF32 = PointF32.from(this.first);
        const last: PointF32 = PointF32.from(this.last);

        while (first.almostEqual(last)) {
            --pointCount;
            last.update(this.at(pointCount - 1));
        }

        if (this.pointCount !== pointCount) {
            this.pointCount = pointCount;
            this.memSeg = this.memSeg.slice(this.offset, this.offset + (pointCount << 1));
        }

        if (this.area > 0) {
            this.reverse();
        }

        return this.memSeg;
    }

    private getPointOffset(index: number): number {
        return this.offset + (index << 1);
    }

    private calculateBounds(): void {
        if (this.isBroken) {
            return;
        }

        const point1: PointF32 = PointF32.from(this.first);
        const point2: PointF32 = PointF32.from(this.last);

        this.closed = point1.almostEqual(point2);

        const pointCount: number = this.pointCount;
        let i: number = 0;
        let point: PointF32 = null;

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

        this.bounds.update(point1, point2);
    }

    public get length(): number {
        const offset: number = this.closedDirty ? 1 : 0;

        return this.pointCount + offset;
    }

    public get first(): PointF32 {
        return this.at(0);
    }

    public get last(): PointF32 {
        return this.at(cycleIndex(this.length, this.pointCount, -1));
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
        const prevPoint: PointF32 = PointF32.zero();
        const currPoint: PointF32 = PointF32.zero();
        let result: number = 0;
        let i: number = 0;

        for (i = 0; i < pointCount; ++i) {
            prevPoint.update(this.at(cycleIndex(i, pointCount, -1)));
            currPoint.update(this.at(i));
            result += (prevPoint.x + currPoint.x) * (prevPoint.y - currPoint.y);
        }

        return 0.5 * result;
    }

    public get absArea(): number {
        return Math.abs(this.area);
    }

    public get position(): PointF32 {
        return this.bounds.position;
    }

    public get size(): PointF32 {
        return this.bounds.size;
    }

    public static create(): PolygonF32 {
        return new PolygonF32();
    }

    public static fromMemSeg(memSeg: Float32Array): PolygonF32 {
        const result = new PolygonF32();

        result.bind(memSeg);

        return result;
    }
}
