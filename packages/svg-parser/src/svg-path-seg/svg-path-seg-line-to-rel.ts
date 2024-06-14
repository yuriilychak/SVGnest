import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegLinetoRel extends SVGPathPointSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number) {
        super(PATH_SEGMENT_TYPE.LINETO_REL, owningPathSegList, x, y);
    }

    public clone(): SVGPathSegLinetoRel {
        return new SVGPathSegLinetoRel(undefined, this.x, this.y);
    }

    public static create(owningPathSegList: unknown, x: number, y: number): SVGPathSegLinetoRel {
        return new SVGPathSegLinetoRel(owningPathSegList, x, y);
    }
}
