import BasicSegment from './basic-segment';

export default class ArcSegment extends BasicSegment {
    #arcConfig;

    constructor(arc, tolerance) {
        const point1 = ArcSegment.getArcPoint(arc, 0);
        const point2 = ArcSegment.getArcPoint(arc, 1);

        super({ point1, point2 }, tolerance);

        this.#arcConfig = arc;
    }

    get isFlat() {
        const subarc = this.splitArcConfig();
        const arcMid = subarc.export(1);
        const mid = BasicSegment.getMidPoint(this.point1, this.point2);
        const dx = mid.x - arcMid.x;
        const dy = mid.y - arcMid.y;

        return dx * dx + dy * dy < this.tolerance * this.tolerance;
    }

    subdivide() {
        return [this.splitArcConfig(), this.splitArcConfig(0.5)];
    }

    splitArc(thetaTolerance = 0) {
        const arcConfig = {
            ...this.#arcConfig,
            theta:
                this.#arcConfig.theta + thetaTolerance * this.#arcConfig.extent,
            extent: 0.5 * this.#arcConfig.extent
        };

        return new ArcSegment(arcConfig, this.tolerance);
    }

    static fromSvg(
        { point1, point2, rx, ry, angle, largeArc, sweep },
        tolerance
    ) {
        const mid = {
            x: 0.5 * (point1.x + point2.x),
            y: 0.5 * (point1.y + point2.y)
        };
        const diff = {
            x: 0.5 * (point2.x - point1.x),
            y: 0.5 * (point2.y - point1.y)
        };

        const angleRadians = ArcSegment.toRadians(angle);

        const cos = Math.cos(angleRadians);
        const sin = Math.sin(angleRadians);

        const current = {
            x: cos * diff.x + sin * diff.y,
            y: -sin * diff.x + cos * diff.y
        };

        const radius = { x: Math.abs(rx), y: Math.abs(ry) };
        const nextSquare = { x: radius.x * radius.x, y: radius.y * radius.y };
        const square1 = { x: current.x * current.x, y: current.y * current.y };
        const radialCheck = square1.x / nextSquare.x + square1.y / nextSquare.y;

        if (radialCheck > 1) {
            const radilSqrt = Math.sqrt(radialCheck);

            radius.x = radilSqrt * radius.x;
            radius.y = radilSqrt * radius.y;
            nextSquare.x = radius.x * radius.x;
            nextSquare.y = radius.y * radius.y;
        }

        let sign = largeArc !== sweep ? -1 : 1;
        const sq = Math.max(
            (nextSquare.x * nextSquare.y -
                nextSquare.x * square1.y -
                nextSquare.y * square1.x) /
                (nextSquare.x * square1.y + nextSquare.y * square1.x),
            0
        );

        const coef = sign * Math.sqrt(sq);
        const c1 = {
            x: coef * (radius.x * current.y / radius.y),
            y: coef * -(radius.y * current.x / radius.x)
        };
        const center = {
            x: mid.x + (cos * c1.x - sin * c1.y),
            y: mid.y + (sin * c1.x + cos * c1.y)
        };
        const u = {
            x: (current.x - c1.x) / radius.x,
            y: (current.y - c1.y) / radius.y
        };
        const v = {
            x: -(current.x + c1.x) / radius.x,
            y: -(current.y + c1.y) / radius.y
        };
        let n = Math.sqrt(u.x * u.x + u.y * u.y);
        let p = u.x;
        sign = u.y < 0 ? -1 : 1;

        let theta = sign * Math.acos(p / n);
        theta = ArcSegment.toDegrees(theta);

        n = Math.sqrt((u.x * u.x + u.y * u.y) * (v.x * v.x + v.y * v.y));
        p = u.x * v.x + u.y * v.y;
        sign = u.x * v.y - u.y * v.x < 0 ? -1 : 1;
        let extent = sign * Math.acos(p / n);
        extent = ArcSegment.toDegrees(extent);

        if (sweep === 1 && extent > 0) {
            extent = extent - 360;
        } else if (sweep === 0 && extent < 0) {
            extent = extent + 360;
        }

        extent = extent % 360;
        theta = theta % 360;

        const arcConfig = {
            center,
            rx: radius.x,
            ry: radius.y,
            theta,
            extent,
            angle
        };

        return new ArcSegment(arcConfig, tolerance);
    }

    static getArcPoint(arc, extentCoef) {
        const angleRadians = ArcSegment.toRadians(arc.angle);
        const theta = ArcSegment.toRadians(arc.theta + arc.extent * extentCoef);
        const cos = Math.cos(angleRadians);
        const sin = Math.sin(angleRadians);
        const thetaCos = Math.cos(theta);
        const thetaSin = Math.sin(theta);

        return {
            x: arc.center.x + cos * arc.rx * thetaCos - sin * arc.ry * thetaSin,
            y: arc.center.y + sin * arc.rx * thetaCos + cos * arc.ry * thetaSin
        };
    }

    static toRadians(degrees) {
        return degrees % 360 * Math.PI / 180;
    }

    static toDegrees(radians) {
        return radians * (180 / Math.PI);
    }

    static lineraize(config, tolerance) {
        const instance = ArcSegment.fromSvg(config, tolerance);
        const result = BasicSegment.linearizeCurve(instance).reverse();

        result.push({ ...config.point2 });
        result.shift();

        return result;
    }
}
