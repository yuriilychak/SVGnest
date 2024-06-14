import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoQuadraticSmoothAbs extends SVGPathPointSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_ABS, owningPathSegList, x, y);
    }

    public clone(): SVGPathSegCurvetoQuadraticSmoothAbs {
        return new SVGPathSegCurvetoQuadraticSmoothAbs(undefined, this.x, this.y);
    }

    public static create(owningPathSegList: unknown, x: number, y: number): SVGPathSegCurvetoQuadraticSmoothAbs {
        return new SVGPathSegCurvetoQuadraticSmoothAbs(owningPathSegList, x, y);
    }
}
