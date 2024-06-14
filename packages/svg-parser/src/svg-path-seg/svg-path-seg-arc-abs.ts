import SVGPathArcSeg from './svg-path-arc-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegArcAbs extends SVGPathArcSeg {
    constructor(
        owningPathSegList: unknown,
        x: number,
        y: number,
        r1: number,
        r2: number,
        angle: number,
        largeArcFlag: number,
        sweepFlag: number
    ) {
        super(PATH_SEGMENT_TYPE.ARC_ABS, owningPathSegList, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
    }

    clone(): SVGPathSegArcAbs {
        return new SVGPathSegArcAbs(undefined, this.x, this.y, this.r1, this.r2, this.angle, this.largeArcFlag, this.sweepFlag);
    }

    static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        r1: number,
        r2: number,
        angle: number,
        largeArcFlag: number,
        sweepFlag: number
    ): SVGPathSegArcAbs {
        return new SVGPathSegArcAbs(owningPathSegList, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
    }
}
