import { IPoint } from './types';
import { TOL } from './constants';
import { almostEqual, midValue } from './shared-helpers';

export default class Point implements IPoint {
    private data: Float64Array;

    private offset: number;

    public constructor(data: Float64Array, offset: number = 0) {
        this.data = data;
        this.offset = offset;
    }

    public bind(data: Float64Array, offset: number): void {
        this.data = data;
        this.offset = offset;
    }

    public set(x: number, y: number): Point {
        this.x = x;
        this.y = y;

        return this;
    }

    public update(point: IPoint): Point {
        return this.set(point.x, point.y);
    }

    public add(point: IPoint): Point {
        this.x += point.x;
        this.y += point.y;

        return this;
    }

    public sub(point: IPoint): Point {
        this.x -= point.x;
        this.y -= point.y;

        return this;
    }

    public mul(point: IPoint): Point {
        this.x *= point.x;
        this.y *= point.y;

        return this;
    }

    public scale(value: number): Point {
        this.x *= value;
        this.y *= value;

        return this;
    }

    public max(point: IPoint): Point {
        return this.set(Math.max(this.x, point.x), Math.max(this.y, point.y));
    }

    public min(point: IPoint): Point {
        return this.set(Math.min(this.x, point.x), Math.min(this.y, point.y));
    }

    public rotate(radianAngle: number): Point {
        const sin: number = Math.sin(radianAngle);
        const cos: number = Math.cos(radianAngle);

        return this.set(this.x * cos - this.y * sin, this.x * sin + this.y * cos);
    }

    public cross(point: IPoint): number {
        return this.y * point.x - this.x * point.y;
    }

    public dot(point: IPoint): number {
        return this.x * point.x + this.y * point.y;
    }

    public len2(point: IPoint): number {
        const offetX: number = this.x - point.x;
        const offetY: number = this.y - point.y;

        return offetX * offetX + offetY * offetY;
    }

    public len(point: IPoint): number {
        return Math.sqrt(this.len2(point));
    }

    public normalize(): Point {
        const length: number = this.length;

        if (!almostEqual(length, 1)) {
            this.x = this.x / length;
            this.y = this.y / length;
        }

        return this;
    }

    public normal(): Point {
        return this.set(this.y, -this.x);
    }

    public reverse(): Point {
        return this.set(-this.x, -this.y);
    }

    public onSegment(pointA: Point, pointB: Point): boolean {
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

        const subA = Point.from(this).sub(pointA);
        const subAB = Point.from(pointB).sub(pointA);

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

    public almostEqual(point: IPoint, tolerance: number = TOL): boolean {
        return almostEqual(this.x, point.x, tolerance) && almostEqual(this.y, point.y, tolerance);
    }

    public interpolateX(beginPoint: IPoint, endPoint: IPoint): number {
        return ((beginPoint.x - endPoint.x) * (this.y - endPoint.y)) / (beginPoint.y - endPoint.y) + endPoint.x;
    }

    public interpolateY(beginPoint: IPoint, endPoint: IPoint): number {
        return ((beginPoint.y - endPoint.y) * (this.x - endPoint.x)) / (beginPoint.x - endPoint.x) + endPoint.y;
    }

    public export(): IPoint {
        return { x: this.x, y: this.y };
    }

    public get x(): number {
        return this.data[this.offset];
    }

    public set x(value: number) {
        this.data[this.offset] = value;
    }

    public get y(): number {
        return this.data[this.offset + 1];
    }

    public set y(value: number) {
        this.data[this.offset + 1] = value;
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

    public static create(x: number, y: number): Point {
        const data = new Float64Array(2);
        data[0] = x;
        data[1] = y;

        return new Point(data);
    }

    public static zero(): Point {
        return Point.create(0, 0);
    }

    public static from(point: IPoint): Point {
        return Point.create(point.x, point.y);
    }

    public static lineEquation(point1: IPoint, point2: IPoint): number[] {
        return [point2.y - point1.y, point1.x - point2.x, point2.x * point1.y - point1.x * point2.y];
    }
}
