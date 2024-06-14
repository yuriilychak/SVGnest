import SVGPathCubicSeg from './svg-path-cubic-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegCurvetoCubicRel extends SVGPathCubicSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
        super(PATH_SEGMENT_TYPE.CURVETO_CUBIC_REL, owningPathSegList, x, y, x1, y1, x2, y2);
    }

    public clone(): SVGPathSegCurvetoCubicRel {
        return new SVGPathSegCurvetoCubicRel(undefined, this.x, this.y, this.x1, this.y1, this.x2, this.y2);
    }

    public static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
    ): SVGPathSegCurvetoCubicRel {
        return new SVGPathSegCurvetoCubicRel(owningPathSegList, x, y, x1, y1, x2, y2);
    }
}
