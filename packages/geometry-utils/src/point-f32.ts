import { ANGLE_CACHE, TOL } from './constants';
import { almostEqual, clipperRound, midValue, slopesEqual } from './helpers';
import Point from './point';

export default class PointF32 {
    private memSeg: Float32Array;

    private offset: number;

    public constructor(data: Float32Array, offset: number = 0) {
        this.memSeg = data;
        this.offset = offset;
    }

    public bind(data: Float32Array, offset: number = 0): this {
        this.memSeg = data;
        this.offset = offset;

        return this;
    }

    public fromMemSeg(data: Float32Array | number[], index: number = 0, offset: number = 0): this {
        this.x = data[offset + (index << 1)];
        this.y = data[offset + (index << 1) + 1];

        return this;
    }

    public fill(memSeg: Float32Array, index: number, offset: number = 0): void {
        memSeg[offset + (index << 1)] = this.x;
        memSeg[offset + (index << 1) + 1] = this.y;
    }

    public set(x: number, y: number): this {
        this.x = x;
        this.y = y;

        return this;
    }

    public update(point: PointF32): this {
        return this.set(point.x, point.y);
    }

    public fromClipper(point: PointF32 | Point): this {
        return this.set(point.x, point.y);
    }

    public add(point: PointF32): this {
        this.x += point.x;
        this.y += point.y;

        return this;
    }

    public sub(point: PointF32): this {
        this.x -= point.x;
        this.y -= point.y;

        return this;
    }

    public mul(point: PointF32): this {
        this.x *= point.x;
        this.y *= point.y;

        return this;
    }

    public scaleUp(value: number): this {
        this.x *= value;
        this.y *= value;

        return this;
    }

    public scaleDown(value: number): this {
        this.x /= value;
        this.y /= value;

        return this;
    }

    public max(point: PointF32): this {
        return this.set(Math.max(this.x, point.x), Math.max(this.y, point.y));
    }

    public min(point: PointF32): this {
        return this.set(Math.min(this.x, point.x), Math.min(this.y, point.y));
    }

    public rotate(angle: number): this {
        const angleData = ANGLE_CACHE.get(angle);
        const sin: number = angleData[0];
        const cos: number = angleData[1];

        return this.set(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
    }

    public cross(point: PointF32): number {
        return this.y * point.x - this.x * point.y;
    }

    public dot(point: PointF32): number {
        return this.x * point.x + this.y * point.y;
    }

    public getBetween(point1: PointF32, point2: PointF32): boolean {
        if (point1.almostEqual(point2) || point1.almostEqual(this) || this.almostEqual(point2)) {
            return false;
        }

        if (point1.x !== point2.x) {
            return this.x > point1.x === this.x < point2.x;
        }

        return this.y > point1.y === this.y < point2.y;
    }

    public len2(point: PointF32): number {
        const offetX: number = this.x - point.x;
        const offetY: number = this.y - point.y;

        return offetX * offetX + offetY * offetY;
    }

    public len(point: PointF32): number {
        return Math.sqrt(this.len2(point));
    }

    public normalize(): this {
        const length: number = this.length;

        if (!almostEqual(length, 1) && !this.isEmpty) {
            this.x = this.x / length;
            this.y = this.y / length;
        }

        return this;
    }

    public round(): this {
        this.x = Math.round(this.x);
        this.y = Math.round(this.y);

        return this;
    }

    public clipperRound(): this {
        this.x = clipperRound(this.x);
        this.y = clipperRound(this.y);

        return this;
    }

    public normal(): this {
        return this.set(this.y, -this.x);
    }

    public reverse(): this {
        return this.set(-this.x, -this.y);
    }

    public onSegment(pointA: PointF32, pointB: PointF32): boolean {
        const midX: number = midValue(this.x, pointA.x, pointB.x);
        const midY: number = midValue(this.y, pointA.y, pointB.y);

        // vertical line
        if (almostEqual(pointA.x, pointB.x) && almostEqual(this.x, pointA.x)) {
            return !almostEqual(this.y, pointB.y) && !almostEqual(this.y, pointA.y) && midY < 0;
        }

        // horizontal line
        if (almostEqual(pointA.y, pointB.y) && almostEqual(this.y, pointA.y)) {
            return !almostEqual(this.x, pointB.x) && !almostEqual(this.x, pointA.x) && midX < 0;
        }

        if (
            // range check
            midX > 0 ||
            midY > 0 ||
            // exclude end points
            this.almostEqual(pointA) ||
            this.almostEqual(pointB)
        ) {
            return false;
        }

        const subA = PointF32.from(this).sub(pointA);
        const subAB = PointF32.from(pointB).sub(pointA);

        if (Math.abs(subA.cross(subAB)) > TOL) {
            return false;
        }

        const dot = subA.dot(subAB);

        if (dot < TOL) {
            return false;
        }

        const len2 = pointA.len2(pointB);

        return !(dot > len2 || almostEqual(dot, len2));
    }

    public almostEqual(point: PointF32, tolerance: number = TOL): boolean {
        return almostEqual(this.x, point.x, tolerance) && almostEqual(this.y, point.y, tolerance);
    }

    public interpolateX(beginPoint: PointF32, endPoint: PointF32): number {
        return ((beginPoint.x - endPoint.x) * (this.y - endPoint.y)) / (beginPoint.y - endPoint.y) + endPoint.x;
    }

    public interpolateY(beginPoint: PointF32, endPoint: PointF32): number {
        return ((beginPoint.y - endPoint.y) * (this.x - endPoint.x)) / (beginPoint.x - endPoint.x) + endPoint.y;
    }

    public export(): Float32Array {
        return this.memSeg.slice(this.offset, this.offset + 2);
    }

    public get x(): number {
        return this.memSeg[this.offset];
    }

    public set x(value: number) {
        this.memSeg[this.offset] = value;
    }

    public get y(): number {
        return this.memSeg[this.offset + 1];
    }

    public set y(value: number) {
        this.memSeg[this.offset + 1] = value;
    }

    public get length(): number {
        return Math.sqrt(this.length2);
    }

    public get length2(): number {
        return this.x * this.x + this.y * this.y;
    }

    public get isEmpty(): boolean {
        return this.x === 0 && this.y === 0;
    }

    public static horzSegmentsOverlap(Pt1a: PointF32, Pt1b: PointF32, Pt2a: PointF32, Pt2b: PointF32): boolean {
        //precondition: both segments are horizontal
        return (
            Pt1a.x > Pt2a.x === Pt1a.x < Pt2b.x ||
            Pt1b.x > Pt2a.x === Pt1b.x < Pt2b.x ||
            Pt2a.x > Pt1a.x === Pt2a.x < Pt1b.x ||
            Pt2b.x > Pt1a.x === Pt2b.x < Pt1b.x ||
            (Pt1a.x === Pt2a.x && Pt1b.x === Pt2b.x) ||
            (Pt1a.x === Pt2b.x && Pt1b.x === Pt2a.x)
        );
    }

    public static slopesEqual(pt1: PointF32, pt2: PointF32, pt3: PointF32, useFullRange: boolean): boolean {
        return slopesEqual(pt1.y - pt2.y, pt2.x - pt3.x, pt1.x - pt2.x, pt2.y - pt3.y, useFullRange);
    }

    public static create(x: number, y: number): PointF32 {
        const data = new Float32Array(2);
        data[0] = x;
        data[1] = y;

        return new PointF32(data);
    }

    public static zero(): PointF32 {
        return PointF32.create(0, 0);
    }

    public static from(point: PointF32): PointF32 {
        return PointF32.create(point.x, point.y);
    }

    public static lineEquation(point1: PointF32, point2: PointF32): number[] {
        return [point2.y - point1.y, point1.x - point2.x, point2.x * point1.y - point1.x * point2.y];
    }

    public static rangeTest(point: PointF32, useFullRange: boolean): boolean {
        if (useFullRange) {
            if (Math.abs(point.x) > PointF32.HIGH_RANGE || Math.abs(point.y) > PointF32.HIGH_RANGE) {
                console.warn('Coordinate outside allowed range in rangeTest().');
            }
        } else if (Math.abs(point.x) > PointF32.LOW_RANGE || Math.abs(point.y) > PointF32.LOW_RANGE) {
            return PointF32.rangeTest(point, true);
        }

        return useFullRange;
    }

    public static pointsAreClose(point1: PointF32, point2: PointF32, distSqrd: number): boolean {
        return PointF32.from(point1).len2(point2) <= distSqrd;
    }

    private static LOW_RANGE = 47453132; // sqrt(2^53 -1)/2
    private static HIGH_RANGE = 4503599627370495; // sqrt(2^106 -1)/2
}
