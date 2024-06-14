import SVGBasePathSeg from './svg-base-path-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathSegClosePath extends SVGBasePathSeg {
    constructor(owningPathSegList: unknown) {
        super(PATH_SEGMENT_TYPE.CLOSEPATH, owningPathSegList);
    }

    public asPathString(): string {
        return this.pathSegTypeAsLetter;
    }

    public clone(): SVGPathSegClosePath {
        return new SVGPathSegClosePath(undefined);
    }

    public static create(owningPathSegList: unknown): SVGPathSegClosePath {
        return new SVGPathSegClosePath(owningPathSegList);
    }
}
