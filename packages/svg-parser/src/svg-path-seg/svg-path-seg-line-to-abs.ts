import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegLinetoAbs extends SVGPathPointSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number) {
        super(PATH_SEGMENT_TYPE.LINETO_ABS, owningPathSegList, x, y);
    }

    public clone(): SVGPathSegLinetoAbs {
        return new SVGPathSegLinetoAbs(undefined, this.x, this.y);
    }

    public static create(owningPathSegList: unknown, x: number, y: number): SVGPathSegLinetoAbs {
        return new SVGPathSegLinetoAbs(owningPathSegList, x, y);
    }
}
