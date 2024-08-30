import { IPoint } from './types';

export default class Point implements IPoint {
    #x: number;

    #y: number;

    protected constructor(x: number, y: number) {
        this.#x = x;
        this.#y = y;
    }

    public set(x: number, y: number): Point {
        this.#x = x;
        this.#y = y;

        return this;
    }

    public update(point: IPoint): Point {
        return this.set(point.x, point.y);
    }

    public add(point: IPoint): Point {
        this.#x += point.x;
        this.#y += point.y;

        return this;
    }

    public sub(point: IPoint): Point {
        this.#x -= point.x;
        this.#y -= point.y;

        return this;
    }

    public max(point: IPoint): Point {
        return this.set(Math.max(this.#x, point.x), Math.max(this.#y, point.y));
    }

    public min(point: IPoint): Point {
        return this.set(Math.min(this.#x, point.x), Math.min(this.#y, point.y));
    }

    public rotate(radianAngle: number): Point {
        const sin: number = Math.sin(radianAngle);
        const cos: number = Math.cos(radianAngle);

        return this.set(this.#x * cos - this.#y * sin, this.#x * sin + this.#y * cos);
    }

    public cross(point1: IPoint, point2: IPoint): number {
        return (this.#y - point1.y) * (point2.x - point1.x) - (this.#x - point1.x) * (point2.y - point1.y);
    }

    public dot(point1: IPoint, point2: IPoint): number {
        return (this.#x - point1.x) * (point2.x - point1.x) + (this.#y - point1.y) * (point2.y - point1.y);
    }

    public len2(point: IPoint): number {
        const offetX: number = this.#x - point.x;
        const offetY: number = this.#y - point.y;

        return offetX * offetX + offetY * offetY;
    }

    public normalize() {
        const len2: number = this.#x * this.#x + this.#y * this.#y;

        if (!Point.almostEqual(len2, 1)) {
            const len: number = Math.sqrt(len2);
            this.#x = this.#x / len;
            this.#y = this.#y / len;
        }

        return this;
    }

    public onSegment(pointA: Point, pointB: Point): boolean {
        // vertical line
        if (Point.almostEqual(pointA.x, pointB.x) && Point.almostEqual(this.#x, pointA.x)) {
            return (
                !Point.almostEqual(this.#y, pointB.y) &&
                !Point.almostEqual(this.#y, pointA.y) &&
                this.#y < Math.max(pointB.y, pointA.y) &&
                this.#y > Math.min(pointB.y, pointA.y)
            );
        }

        // horizontal line
        if (Point.almostEqual(pointA.y, pointB.y) && Point.almostEqual(this.#y, pointA.y)) {
            return (
                !Point.almostEqual(this.#x, pointB.x) &&
                !Point.almostEqual(this.#x, pointA.x) &&
                this.#x < Math.max(pointB.x, pointA.x) &&
                this.#x > Math.min(pointB.x, pointA.x)
            );
        }

        // range check
        if (
            this.#x < Math.min(pointA.x, pointB.x) ||
            this.#x > Math.max(pointA.x, pointB.x) ||
            this.#y < Math.min(pointA.y, pointB.y) ||
            this.#y > Math.max(pointA.y, pointB.y)
        ) {
            return false;
        }

        // exclude end points
        if (this.almostEqual(pointA) || this.almostEqual(pointB)) {
            return false;
        }

        if (Math.abs(this.cross(pointA, pointB)) > Point.TOL) {
            return false;
        }

        const dot = this.dot(pointA, pointB);

        if (!(dot >= 0 && Math.abs(dot) >= Point.TOL)) {
            return false;
        }

        const len2 = pointA.len2(pointB);

        return !(dot > len2 || Point.almostEqual(dot, len2));
    }

    public almostEqual(point: IPoint, tolerance: number = Point.TOL): boolean {
        return Point.almostEqual(this.#x, point.x, tolerance) && Point.almostEqual(this.#y, point.y, tolerance);
    }

    public interpolateX(beginPoint: IPoint, endPoint: IPoint): number {
        return ((beginPoint.x - endPoint.x) * (this.#y - endPoint.y)) / (beginPoint.y - endPoint.y) + endPoint.x;
    }

    public interpolateY(beginPoint: IPoint, endPoint: IPoint): number {
        return ((beginPoint.y - endPoint.y) * (this.#x - endPoint.x)) / (beginPoint.x - endPoint.x) + endPoint.y;
    }

    public export(): IPoint {
        return { x: this.#x, y: this.#y };
    }

    public get x(): number {
        return this.#x;
    }

    public set x(value: number) {
        this.#x = value;
    }

    public get y(): number {
        return this.#y;
    }

    public set y(value: number) {
        this.#y = value;
    }

    public static create(x: number, y: number): Point {
        return new Point(x, y);
    }

    public static from(point: IPoint): Point {
        return new Point(point.x, point.y);
    }

    public static zero(): Point {
        return new Point(0, 0);
    }

    // TODO remove it when fully refactor geometry utils
    private static almostEqual(a: number, b: number = 0, tolerance: number = Point.TOL): boolean {
        return Math.abs(a - b) < tolerance;
    }

    private static TOL: number = Math.pow(10, -9);
}
