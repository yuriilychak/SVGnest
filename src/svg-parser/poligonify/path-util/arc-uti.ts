import FloatPoint from "../../../float-point";
import { withinDistance } from "../../../geometry-util";

const MAX_ANGLE: number = 360;
const MID_ANGLE: number = 180;

class SvgArcConfig {
  private _begin: FloatPoint;
  private _end: FloatPoint;
  private _radius: FloatPoint;
  private _angle: number;
  private _sweep: number;
  private _sign: number;

  constructor(
    begin: FloatPoint,
    end: FloatPoint,
    radius: FloatPoint,
    angle: number,
    largeArc: number,
    sweep: number
  ) {
    this._begin = begin;
    this._end = end;
    this._radius = radius;
    this._angle = angle;
    this._sweep = sweep;
    this._sign = largeArc !== sweep ? -1 : 1;
  }

  getExtent(inputExtent: number): number {
    let result: number = inputExtent;

    if (this._sweep == 1 && result > 0) {
      result -= MAX_ANGLE;
    } else if (this._sweep == 0 && result < 0) {
      result += MAX_ANGLE;
    }

    return result % MAX_ANGLE;
  }

  public get mid(): FloatPoint {
    const result: FloatPoint = FloatPoint.add(this._begin, this._end);

    result.scale(0.5);

    return result;
  }
  public get diff(): FloatPoint {
    const result: FloatPoint = FloatPoint.sub(this._begin, this._end);
    result.scale(0.5);

    return result;
  }

  public get p2(): FloatPoint {
    return this._end;
  }

  public get r(): FloatPoint {
    return this._radius;
  }

  public get angle(): number {
    return this._angle;
  }

  public get sign(): number {
    return this._sign;
  }
}

class ArcConfig {
  private _center: FloatPoint;
  private _r: FloatPoint;
  private _theta: number;
  private _extent: number;
  private _angle: number;

  constructor(
    center: FloatPoint,
    r: FloatPoint,
    theta: number,
    extent: number,
    angle: number
  ) {
    this._center = center;
    this._r = r;
    this._theta = theta;
    this._extent = extent;
    this._angle = angle;
  }

  public split(isLeft: boolean): ArcConfig {
    return new ArcConfig(
      this._center,
      this._r,
      isLeft ? this._theta : this._theta + 0.5 * this._extent,
      0.5 * this._extent,
      this._angle
    );
  }

  private _getSvgPoints(scaledExtent: number): Array<FloatPoint> {
    const angle: number = ArcConfig._degreesToRadians(this._angle);
    const theta1: number = ArcConfig._degreesToRadians(this._theta);
    const theta2: number = ArcConfig._degreesToRadians(
      this._theta + scaledExtent
    );
    const t1cos: number = Math.cos(theta1);
    const t1sin: number = Math.sin(theta1);
    const t2cos: number = Math.cos(theta2);
    const t2sin: number = Math.sin(theta2);
    const rCos = this._r.clone().scale(Math.cos(angle));
    const rSin = this._r.clone().scale(Math.sin(angle));

    return [
      new FloatPoint(
        this._center.x + rCos.x * t1cos - rSin.y * t1sin,
        this._center.y + rSin.x * t1cos + rCos.y * t1sin
      ),
      new FloatPoint(
        this._center.x + rCos.x * t2cos - rSin.y * t2sin,
        this._center.y + rSin.x * t2cos + rCos.y * t2sin
      )
    ];
  }

  // convert from center point/angle sweep definition to SVG point and flag definition of arcs
  // ported from http://commons.oreilly.com/wiki/index.php/SVG_Essentials/Paths
  public toSvg(scale: number): SvgArcConfig {
    const scaledExtent: number = this._extent * scale;
    const angle: number = ArcConfig._degreesToRadians(this._angle);
    const svgPoints: Array<FloatPoint> = this._getSvgPoints(scaledExtent);
    const largeArc: number = scaledExtent > MID_ANGLE ? 1 : 0;
    const sweep: number = scaledExtent > 0 ? 1 : 0;

    return new SvgArcConfig(
      svgPoints[0],
      svgPoints[1],
      this._r,
      angle,
      largeArc,
      sweep
    );
  }

  // convert from SVG format arc to center point arc
  static svgToCenter(arc: SvgArcConfig): ArcConfig {
    const mid: FloatPoint = arc.mid;
    const diff: FloatPoint = arc.diff;
    const angleRadians: number = ArcConfig._degreesToRadians(arc.angle);
    const cos: number = Math.cos(angleRadians);
    const sin: number = Math.sin(angleRadians);
    const point1 = new FloatPoint(
      cos * diff.x + sin * diff.y,
      -sin * diff.x + cos * diff.y
    );
    const r = FloatPoint.abs(arc.r);
    let Pr: FloatPoint = FloatPoint.square(r);
    const P1 = FloatPoint.square(point1);
    const radiiCheck: number = P1.x / Pr.x + P1.y / Pr.y;
    const radiiSqrt: number = Math.sqrt(radiiCheck);

    if (radiiCheck > 1) {
      r.scale(radiiSqrt);
      Pr = FloatPoint.square(r);
    }

    const sq: number = Math.sqrt(
      Math.max(
        (Pr.x * Pr.y - Pr.x * P1.y - Pr.y * P1.x) / (Pr.x * P1.y + Pr.y * P1.x),
        0
      )
    );
    const coef: number = arc.sign * sq;
    const c = new FloatPoint(
      coef * ((r.x * point1.y) / r.y),
      -coef * ((r.y * point1.x) / r.x)
    );
    const center: FloatPoint = new FloatPoint(
      mid.x + (cos * c.x - sin * c.y),
      mid.y + (sin * c.x + cos * c.y)
    );
    const u = new FloatPoint((point1.x - c.x) / r.x, (point1.y - c.y) / r.y);
    const v = new FloatPoint(-(point1.x + c.x) / r.x, -(point1.y + c.y) / r.y);
    const squear: number = u.squareDistance;
    const theta: number =
      ArcConfig._getTheta(u.y, u.x, Math.sqrt(squear)) % MAX_ANGLE;
    const n = Math.sqrt(squear * v.squareDistance);
    const p = u.x * v.x + u.y * v.y;
    const extent: number = arc.getExtent(
      ArcConfig._getTheta(u.x * v.y - u.y * v.x, p, n)
    );

    return new ArcConfig(center, r, theta, extent, arc.angle);
  }

  private static _getTheta(signValue: number, p: number, n: number): number {
    const sign = signValue < 0 ? -1 : 1;

    return ArcConfig._radiansToDegrees(sign * Math.acos(p / n));
  }

  private static _degreesToRadians(angle: number): number {
    return (angle % MAX_ANGLE) * (Math.PI / MID_ANGLE);
  }

  private static _radiansToDegrees(angle: number): number {
    return angle * (180 / Math.PI);
  }
}

export default function linearize(
  p1: FloatPoint,
  p2: FloatPoint,
  rx: number,
  ry: number,
  angle: number,
  largearc: number,
  sweep: number,
  tol: number
): Array<FloatPoint> {
  const finished: Array<FloatPoint> = [p2]; // list of points to return
  const svgArc = new SvgArcConfig(
    p1,
    p2,
    new FloatPoint(rx, ry),
    angle,
    largearc,
    sweep
  );
  let arc: ArcConfig = ArcConfig.svgToCenter(svgArc);
  const todo: Array<ArcConfig> = [arc]; // list of arcs to divide
  let fullArc: SvgArcConfig;
  let subArc: SvgArcConfig;
  let arcMid: FloatPoint;
  let mid: FloatPoint;
  let arc1: ArcConfig;
  let arc2: ArcConfig;

  // recursion could stack overflow, loop instead
  while (todo.length > 0) {
    arc = todo[0];
    fullArc = arc.toSvg(1);
    subArc = arc.toSvg(0.5);
    arcMid = subArc.p2;
    mid = fullArc.mid;

    // compare midpoint of line with midpoint of arc
    // this is not 100% accurate, but should be a good heuristic for flatness in most cases
    if (withinDistance(mid, arcMid, tol)) {
      finished.unshift(fullArc.p2);
      todo.shift();
    } else {
      arc1 = arc.split(true);
      arc2 = arc.split(false);
      todo.splice(0, 1, arc1, arc2);
    }
  }
  return finished;
}
