import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegMovetoAbs extends SVGPathPointSeg {
    public constructor(owningPathSegList: unknown, x: number, y: number) {
        super(PATH_SEGMENT_TYPE.MOVETO_ABS, owningPathSegList, x, y);
    }

    public clone(): SVGPathSegMovetoAbs {
        return new SVGPathSegMovetoAbs(undefined, this.x, this.y);
    }

    public static create(owningPathSegList: unknown, x: number, y: number): SVGPathSegMovetoAbs {
        return new SVGPathSegMovetoAbs(owningPathSegList, x, y);
    }
}
