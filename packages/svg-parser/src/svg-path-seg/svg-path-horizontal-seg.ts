import SVGPathBaseSeg from './svg-path-base-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathHorizontalSeg extends SVGPathBaseSeg {
    #x: number;

    public constructor(type: PATH_SEGMENT_TYPE, [x]: number[], owningPathSegList?: unknown) {
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

    public clone(): SVGPathHorizontalSeg {
        return new SVGPathHorizontalSeg(this.pathSegType, [this.x]);
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathHorizontalSeg {
        return new SVGPathHorizontalSeg(type, data, owningPathSegList);
    }
}
