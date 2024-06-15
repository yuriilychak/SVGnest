import SVGPathBaseSeg from './svg-path-base-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathVerticalSeg extends SVGPathBaseSeg {
    #y: number;

    public constructor(type: PATH_SEGMENT_TYPE, [y]: number[], owningPathSegList?: unknown) {
        super(type, owningPathSegList);
        this.#y = y;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.#y}`;
    }

    public get y(): number {
        return this.#y;
    }

    public set y(value: number) {
        this.#y = value;
        this.segmentChanged();
    }

    public clone(): SVGPathVerticalSeg {
        return new SVGPathVerticalSeg(this.pathSegType, [this.y]);
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathVerticalSeg {
        return new SVGPathVerticalSeg(type, data, owningPathSegList);
    }
}
