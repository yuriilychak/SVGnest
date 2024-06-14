import SVGPathCubicSmoothSeg from './svg-path-cubic-smooth-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoCubicSmoothAbs extends SVGPathCubicSmoothSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number, x2: number, y2: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_ABS, owningPathSegList, x, y, x2, y2);
    }

    public clone(): SVGPathSegCurvetoCubicSmoothAbs {
        return new SVGPathSegCurvetoCubicSmoothAbs(undefined, this.x, this.y, this.x2, this.y2);
    }

    public static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        x2: number,
        y2: number
    ): SVGPathSegCurvetoCubicSmoothAbs {
        return new SVGPathSegCurvetoCubicSmoothAbs(owningPathSegList, x, y, x2, y2);
    }
}
