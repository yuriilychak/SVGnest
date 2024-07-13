import { IPoint } from '../../../types';
import { IArcSegmentConfig, IArcSegmentData, IBasicSegmentData } from '../types';
import BasicSegment from './basic-segment';

export default class ArcSegment extends BasicSegment {
    #arcConfig: IArcSegmentConfig;

    protected constructor(arc: IArcSegmentConfig, tolerance: number) {
        super(arc, tolerance);

        this.#arcConfig = arc;
    }

    protected get isFlat(): boolean {
        const subArc: ArcSegment = this.splitArc();
        const arcMid: IPoint = subArc.export(1);
        const mid: IPoint = BasicSegment.getMidPoint(this.point1, this.point2);
        const dx: number = mid.x - arcMid.x;
        const dy: number = mid.y - arcMid.y;

        return dx * dx + dy * dy < this.tolerance * this.tolerance;
    }

    protected subdivide(): BasicSegment[] {
        return [this.splitArc(), this.splitArc(0.5)];
    }

    private splitArc(thetaTolerance: number = 0): ArcSegment {
        const { center, radius, extent, theta, angle } = this.#arcConfig;
        const nextTheta: number = theta + thetaTolerance * extent;
        const nextExtent: number = 0.5 * this.#arcConfig.extent;

        return ArcSegment.create(center, radius, angle, nextTheta, nextExtent, this.tolerance);
    }

    private static fromSvg({ point1, point2, rx, ry, angle, largeArc, sweep }: IArcSegmentData, tolerance: number) {
        const mid: IPoint = {
            x: 0.5 * (point1.x + point2.x),
            y: 0.5 * (point1.y + point2.y)
        };
        const diff: IPoint = {
            x: 0.5 * (point2.x - point1.x),
            y: 0.5 * (point2.y - point1.y)
        };

        const angleRadians: number = ArcSegment.toRadians(angle);

        const cos: number = Math.cos(angleRadians);
        const sin: number = Math.sin(angleRadians);

        const current: IPoint = {
            x: cos * diff.x + sin * diff.y,
            y: -sin * diff.x + cos * diff.y
        };

        const radius: IPoint = { x: Math.abs(rx), y: Math.abs(ry) };
        const nextSquare: IPoint = { x: radius.x * radius.x, y: radius.y * radius.y };
        const square1: IPoint = { x: current.x * current.x, y: current.y * current.y };
        const radialCheck: number = square1.x / nextSquare.x + square1.y / nextSquare.y;

        if (radialCheck > 1) {
            const radilSqrt: number = Math.sqrt(radialCheck);

            radius.x = radilSqrt * radius.x;
            radius.y = radilSqrt * radius.y;
            nextSquare.x = radius.x * radius.x;
            nextSquare.y = radius.y * radius.y;
        }

        let sign: number = largeArc !== sweep ? -1 : 1;
        const sq: number = Math.max(
            (nextSquare.x * nextSquare.y - nextSquare.x * square1.y - nextSquare.y * square1.x) /
                (nextSquare.x * square1.y + nextSquare.y * square1.x),
            0
        );

        const coef: number = sign * Math.sqrt(sq);
        const c1: IPoint = {
            x: coef * ((radius.x * current.y) / radius.y),
            y: coef * -((radius.y * current.x) / radius.x)
        };
        const center: IPoint = {
            x: mid.x + (cos * c1.x - sin * c1.y),
            y: mid.y + (sin * c1.x + cos * c1.y)
        };
        const u: IPoint = {
            x: (current.x - c1.x) / radius.x,
            y: (current.y - c1.y) / radius.y
        };
        const v: IPoint = {
            x: -(current.x + c1.x) / radius.x,
            y: -(current.y + c1.y) / radius.y
        };
        let n: number = Math.sqrt(u.x * u.x + u.y * u.y);
        let p: number = u.x;
        sign = u.y < 0 ? -1 : 1;

        let theta: number = sign * Math.acos(p / n);
        theta = ArcSegment.toDegrees(theta);

        n = Math.sqrt((u.x * u.x + u.y * u.y) * (v.x * v.x + v.y * v.y));
        p = u.x * v.x + u.y * v.y;
        sign = u.x * v.y - u.y * v.x < 0 ? -1 : 1;
        let extent: number = sign * Math.acos(p / n);
        extent = ArcSegment.toDegrees(extent);

        if (sweep === 1 && extent > 0) {
            extent = extent - 360;
        } else if (sweep === 0 && extent < 0) {
            extent = extent + 360;
        }

        extent = extent % 360;
        theta = theta % 360;

        return ArcSegment.create(center, radius, angle, theta, extent, tolerance);
    }

    private static getArcPoint(center: IPoint, radius: IPoint, angle: number, theta: number, extent: number): IPoint {
        const angleRadians: number = ArcSegment.toRadians(angle);
        const resultTheta: number = ArcSegment.toRadians(theta + extent);
        const cos: number = Math.cos(angleRadians);
        const sin: number = Math.sin(angleRadians);
        const thetaCos: number = Math.cos(resultTheta);
        const thetaSin: number = Math.sin(resultTheta);

        return {
            x: center.x + cos * radius.x * thetaCos - sin * radius.y * thetaSin,
            y: center.y + sin * radius.x * thetaCos + cos * radius.y * thetaSin
        };
    }

    private static create(
        center: IPoint,
        radius: IPoint,
        angle: number,
        theta: number,
        extent: number,
        tolerance: number
    ): ArcSegment {
        const point1: IPoint = ArcSegment.getArcPoint(center, radius, angle, theta, 0);
        const point2: IPoint = ArcSegment.getArcPoint(center, radius, angle, theta, extent);
        const arcConfig: IArcSegmentConfig = { point1, point2, center, radius, theta, extent, angle };

        return new ArcSegment(arcConfig, tolerance);
    }

    private static toRadians(degrees: number): number {
        return ((degrees % 360) * Math.PI) / 180;
    }

    private static toDegrees(radians: number): number {
        return radians * (180 / Math.PI);
    }

    public static lineraize(config: IBasicSegmentData, tolerance: number): IPoint[] {
        const instance: ArcSegment = ArcSegment.fromSvg(config as IArcSegmentData, tolerance);
        const result: IPoint[] = BasicSegment.linearizeCurve(instance).reverse();

        result.push({ ...config.point2 });
        result.shift();

        return result;
    }
}
