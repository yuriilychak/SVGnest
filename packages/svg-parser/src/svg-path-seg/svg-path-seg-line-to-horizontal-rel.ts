import SVGPathHorizontalSeg from './svg-path-horizontal-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegLinetoHorizontalRel extends SVGPathHorizontalSeg {
    public constructor(owningPathSegList: unknown, x: number) {
        super(PATH_SEGMENT_TYPE.LINETO_HORIZONTAL_ABS, owningPathSegList, x);
    }

    public clone(): SVGPathSegLinetoHorizontalRel {
        return new SVGPathSegLinetoHorizontalRel(undefined, this.x);
    }

    public static create(owningPathSegList: unknown, x: number): SVGPathSegLinetoHorizontalRel {
        return new SVGPathSegLinetoHorizontalRel(owningPathSegList, x);
    }
}
