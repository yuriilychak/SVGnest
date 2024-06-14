import SVGPathArcSeg from './svg-path-arc-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegArcRel extends SVGPathArcSeg {
    public constructor(
        owningPathSegList: unknown,
        x: number,
        y: number,
        r1: number,
        r2: number,
        angle: number,
        largeArcFlag: number,
        sweepFlag: number
    ) {
        super(PATH_SEGMENT_TYPE.ARC_REL, owningPathSegList, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
    }

    public clone(): SVGPathSegArcRel {
        return new SVGPathSegArcRel(undefined, this.x, this.y, this.r1, this.r2, this.angle, this.largeArcFlag, this.sweepFlag);
    }

    public static create(
        owningPathSegList: unknown,
        x: number,
        y: number,
        r1: number,
        r2: number,
        angle: number,
        largeArcFlag: number,
        sweepFlag: number
    ): SVGPathSegArcRel {
        return new SVGPathSegArcRel(owningPathSegList, x, y, r1, r2, angle, largeArcFlag, sweepFlag);
    }
}
