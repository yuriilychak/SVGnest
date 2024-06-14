import SVGBasePathSeg from './svg-base-path-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathHorizontalSeg extends SVGBasePathSeg {
    #x: number;

    public constructor(type: PATH_SEGMENT_TYPE, owningPathSegList: unknown, x: number) {
        super(type, owningPathSegList);
        this.#x = x;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.#x}`;
    }

    public get x(): number {
        return this.#x;
    }

    public set x(value: number) {
        this.#x = value;
        this.segmentChanged();
    }
}
