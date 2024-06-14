import SVGPathCubicSeg from './svg-path-cubic-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoCubicAbs extends SVGPathCubicSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_CUBIC_ABS, owningPathSegList, x, y, x1, y1, x2, y2);
    }

    public clone(): SVGPathSegCurvetoCubicAbs {
        return new SVGPathSegCurvetoCubicAbs(undefined, this.x, this.y, this.x1, this.y1, this.x2, this.y2);
    }

    public static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
    ): SVGPathSegCurvetoCubicAbs {
        return new SVGPathSegCurvetoCubicAbs(owningPathSegList, x, y, x1, y1, x2, y2);
    }
}
