import { mid_value_f64 } from 'wasm-nesting';
import { ANGLE_CACHE, TOL_F64 } from '../../constants';
import { almostEqual, clipperRound, slopesEqual } from '../../helpers';
import type { Point, TypedArray } from '../../types';

export default abstract class PointBase<T extends TypedArray> implements Point<T> {
    private memSeg: T;

    private offset: number;

    public constructor(data: T, offset: number = 0) {
        this.memSeg = data;
        this.offset = offset;
    }

    public bind(data: T, offset: number = 0): this {
        this.memSeg = data;
        this.offset = offset;

        return this;
    }

    public fromMemSeg(data: ArrayLike<number>, index: number = 0, offset: number = 0): this {
        const memIndex: number = offset + (index << 1);

        this.x = data[memIndex];
        this.y = data[memIndex + 1];

        return this;
    }

    public fill(memSeg: TypedArray, index: number, offset: number = 0): void {
        const memIndex: number = offset + (index << 1);

        memSeg[memIndex] = this.x;
        memSeg[memIndex + 1] = this.y;
    }

    public set(x: number, y: number): this {
        this.x = x;
        this.y = y;

        return this;
    }

    public update(point: Point): this {
        return this.set(point.x, point.y);
    }

    public fromClipper(point: Point): this {
        return this.set(point.x, point.y);
    }

    public add(point: Point): this {
        this.x += point.x;
        this.y += point.y;

        return this;
    }

    public sub(point: Point): this {
        this.x -= point.x;
        this.y -= point.y;

        return this;
    }

    public mul(point: Point): this {
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

    public max(point: Point): this {
        return this.set(Math.max(this.x, point.x), Math.max(this.y, point.y));
    }

    public min(point: Point): this {
        return this.set(Math.min(this.x, point.x), Math.min(this.y, point.y));
    }

    public rotate(angle: number): this {
        const angleData = ANGLE_CACHE.get(angle);
        const sin: number = angleData[0];
        const cos: number = angleData[1];

        return this.set(
            this.x * cos - this.y * sin,
            this.x * sin + this.y * cos
        );
    }

    public cross(point: Point): number {
        return this.y * point.x - this.x * point.y;
    }

    public dot(point: Point): number {
        return this.x * point.x + this.y * point.y;
    }

    public getBetween(point1: Point, point2: Point): boolean {
        if (point1.almostEqual(point2) || point1.almostEqual(this) || this.almostEqual(point2)) {
            return false;
        }

        if (point1.x !== point2.x) {
            return this.x > point1.x === this.x < point2.x;
        }

        return this.y > point1.y === this.y < point2.y;
    }

    public len2(point: Point): number {
        const offetX: number = this.x - point.x;
        const offetY: number = this.y - point.y;

        return offetX * offetX + offetY * offetY;
    }

    public len(point: Point): number {
        return Math.sqrt(this.len2(point));
    }

    public normalize(): this {
        const length: number = this.length;

        if (!almostEqual(length, 1) && !this.isEmpty) {
            this.scaleDown(length);
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

    public almostEqual(point: Point, tolerance: number = TOL_F64): boolean {
        return this.almostEqualX(point, tolerance) && this.almostEqualY(point, tolerance);
    }

    public almostEqualX(point: Point, tolerance: number = TOL_F64): boolean {
        return almostEqual(this.x, point.x, tolerance);
    }

    public almostEqualY(point: Point, tolerance: number = TOL_F64): boolean {
        return almostEqual(this.y, point.y, tolerance);
    }


    public interpolateX(beginPoint: Point, endPoint: Point): number {
        return ((beginPoint.x - endPoint.x) * (this.y - endPoint.y)) / (beginPoint.y - endPoint.y) + endPoint.x;
    }

    public interpolateY(beginPoint: Point, endPoint: Point): number {
        return ((beginPoint.y - endPoint.y) * (this.x - endPoint.x)) / (beginPoint.x - endPoint.x) + endPoint.y;
    }

    public export(): T {
        return this.memSeg.slice(this.offset, this.offset + 2) as T;
    }

    public rangeTest(useFullRange: boolean): boolean {
        if (useFullRange) {
            if (Math.abs(this.x) > PointBase.HIGH_RANGE || Math.abs(this.y) > PointBase.HIGH_RANGE) {
                console.warn('Coordinate outside allowed range in rangeTest().');
            }
        } else if (Math.abs(this.x) > PointBase.LOW_RANGE || Math.abs(this.y) > PointBase.LOW_RANGE) {
            return this.rangeTest(true);
        }

        return useFullRange;
    }

    public abstract clone(point?: Point): PointBase<T>;

    public closeTo(point: Point, distSqrd: number): boolean {
        return this.len2(point) <= distSqrd;
    }

    public onSegment(pointA: Point, pointB: Point): boolean {
        const midX: number = mid_value_f64(this.x, pointA.x, pointB.x);
        const midY: number = mid_value_f64(this.y, pointA.y, pointB.y);

        // vertical line
        if (pointA.almostEqualX(pointB) && pointA.almostEqualX(this)) {
            return !this.almostEqualY(pointB) && !this.almostEqualY(pointA) && midY < 0;
        }

        // horizontal line
        if (pointA.almostEqualY(pointB) && pointA.almostEqualY(this)) {
            return !this.almostEqualX(pointB) && !this.almostEqualX(pointA) && midX < 0;
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

        const subA = this.clone().sub(pointA);
        const subAB = this.clone(pointB).sub(pointA);

        if (!almostEqual(subA.cross(subAB))) {
            return false;
        }

        const dot = subA.dot(subAB);

        if (dot < TOL_F64) {
            return false;
        }

        const len2 = pointA.len2(pointB);

        return !(dot > len2 || almostEqual(dot, len2));
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

    public static horzSegmentsOverlap(Pt1a: Point, Pt1b: Point, Pt2a: Point, Pt2b: Point): boolean {
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

    public static slopesEqual(pt1: Point, pt2: Point, pt3: Point, useFullRange: boolean): boolean {
        return slopesEqual(pt1.y - pt2.y, pt2.x - pt3.x, pt1.x - pt2.x, pt2.y - pt3.y, useFullRange);
    }


    public static lineEquation(point1: Point, point2: Point): number[] {
        return [point2.y - point1.y, point1.x - point2.x, point2.x * point1.y - point1.x * point2.y];
    }

    // returns the intersection of AB and EF
    // or null if there are no intersections or other numerical error
    // if the infinite flag is set, AE and EF describe infinite lines without endpoints, they are finite line segments otherwise
    public static lineIntersect(A: Point, B: Point, E: Point, F: Point): boolean {
        const [a1, b1, c1] = PointBase.lineEquation(A, B);
        const [a2, b2, c2] = PointBase.lineEquation(E, F);
        const denom = a1 * b2 - a2 * b1;
        const x = (b1 * c2 - b2 * c1) / denom;
        const y = (a2 * c1 - a1 * c2) / denom;
    
        // lines are colinear
        /* var crossABE = (E.y - A.y) * (B.x - A.x) - (E.x - A.x) * (B.y - A.y);
            var crossABF = (F.y - A.y) * (B.x - A.x) - (F.x - A.x) * (B.y - A.y);
            if(_almostEqual(crossABE,0) && _almostEqual(crossABF,0)){
                return null;
            }*/
    
        return !(
            !(isFinite(x) && isFinite(y)) ||
            // coincident points do not count as intersecting
            (!A.almostEqualX(B) && mid_value_f64(x, A.x, B.x) > 0) ||
            (!A.almostEqualY(B) && mid_value_f64(y, A.y, B.y) > 0) ||
            (!E.almostEqualX(F) && mid_value_f64(x, E.x, F.x) > 0) ||
            (!E.almostEqualY(F) && mid_value_f64(y, E.y, F.y) > 0)
        );
    }

    private static LOW_RANGE = 47453132; // sqrt(2^53 -1)/2

    private static HIGH_RANGE = 4503599627370495; // sqrt(2^106 -1)/2
}
