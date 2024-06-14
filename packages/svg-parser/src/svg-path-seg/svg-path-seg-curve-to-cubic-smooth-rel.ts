import SVGPathCubicSmoothSeg from './svg-path-cubic-smooth-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoCubicSmoothRel extends SVGPathCubicSmoothSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number, x2: number, y2: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_CUBIC_SMOOTH_REL, owningPathSegList, x, y, x2, y2);
    }

    public clone(): SVGPathSegCurvetoCubicSmoothRel {
        return new SVGPathSegCurvetoCubicSmoothRel(undefined, this.x, this.y, this.x2, this.y2);
    }

    public static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        x2: number,
        y2: number
    ): SVGPathSegCurvetoCubicSmoothRel {
        return new SVGPathSegCurvetoCubicSmoothRel(owningPathSegList, x, y, x2, y2);
    }
}
