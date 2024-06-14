import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegMovetoRel extends SVGPathPointSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number) {
        super(PATH_SEGMENT_TYPE.MOVETO_REL, owningPathSegList, x, y);
    }

    public clone(): SVGPathSegMovetoRel {
        return new SVGPathSegMovetoRel(undefined, this.x, this.y);
    }

    public static create(owningPathSegList: unknown, x: number, y: number): SVGPathSegMovetoRel {
        return new SVGPathSegMovetoRel(owningPathSegList, x, y);
    }
}
