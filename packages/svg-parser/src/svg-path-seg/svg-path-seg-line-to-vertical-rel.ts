import SVGPathVerticalSeg from './svg-path-vertical-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegLinetoVerticalRel extends SVGPathVerticalSeg {
    public constructor(owningPathSegList: unknown, y: number) {
        super(PATH_SEGMENT_TYPE.LINETO_VERTICAL_REL, owningPathSegList, y);
    }

    public clone(): SVGPathSegLinetoVerticalRel {
        return new SVGPathSegLinetoVerticalRel(undefined, this.y);
    }

    public static create(owningPathSegList: unknown, y: number): SVGPathSegLinetoVerticalRel {
        return new SVGPathSegLinetoVerticalRel(owningPathSegList, y);
    }
}
