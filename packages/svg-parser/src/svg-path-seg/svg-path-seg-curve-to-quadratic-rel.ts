import SVGPathQuadraticSeg from './svg-path-quadratic-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoQuadraticRel extends SVGPathQuadraticSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number, x1: number, y1: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_QUADRATIC_REL, owningPathSegList, x, y, x1, y1);
    }

    public clone(): SVGPathSegCurvetoQuadraticRel {
        return new SVGPathSegCurvetoQuadraticRel(undefined, this.x, this.y, this.x1, this.y1);
    }

    public static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        x1: number,
        y1: number
    ): SVGPathSegCurvetoQuadraticRel {
        return new SVGPathSegCurvetoQuadraticRel(owningPathSegList, x, y, x1, y1);
    }
}
