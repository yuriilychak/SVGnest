import SVGPathHorizontalSeg from './svg-path-horizontal-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegLinetoHorizontalAbs extends SVGPathHorizontalSeg {
    public constructor(owningPathSegList: unknown, x: number) {
        super(PATH_SEGMENT_TYPE.LINETO_VERTICAL_REL, owningPathSegList, x);
    }

    public clone(): SVGPathSegLinetoHorizontalAbs {
        return new SVGPathSegLinetoHorizontalAbs(undefined, this.x);
    }

    public static create(owningPathSegList: unknown, x: number): SVGPathSegLinetoHorizontalAbs {
        return new SVGPathSegLinetoHorizontalAbs(owningPathSegList, x);
    }
}
