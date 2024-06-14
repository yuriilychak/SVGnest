import SVGPathVerticalSeg from './svg-path-vertical-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegLinetoVerticalAbs extends SVGPathVerticalSeg {
    public constructor(owningPathSegList: unknown, y: number) {
        super(PATH_SEGMENT_TYPE.LINETO_VERTICAL_ABS, owningPathSegList, y);
    }

    public clone(): SVGPathSegLinetoVerticalAbs {
        return new SVGPathSegLinetoVerticalAbs(undefined, this.y);
    }

    public static create(owningPathSegList: unknown, y: number): SVGPathSegLinetoVerticalAbs {
        return new SVGPathSegLinetoVerticalAbs(owningPathSegList, y);
    }
}
