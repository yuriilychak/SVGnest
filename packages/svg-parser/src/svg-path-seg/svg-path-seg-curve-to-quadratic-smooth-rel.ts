import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoQuadraticSmoothRel extends SVGPathPointSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_SMOOTH_REL, owningPathSegList, x, y);
    }

    public clone(): SVGPathSegCurvetoQuadraticSmoothRel {
        return new SVGPathSegCurvetoQuadraticSmoothRel(undefined, this.x, this.y);
    }

    public static create(owningPathSegList: unknown, x: number, y: number): SVGPathSegCurvetoQuadraticSmoothRel {
        return new SVGPathSegCurvetoQuadraticSmoothRel(owningPathSegList, x, y);
    }
}
