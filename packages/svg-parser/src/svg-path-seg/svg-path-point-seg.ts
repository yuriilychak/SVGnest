import SVGPathHorizontalSeg from './svg-path-horizontal-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathPointSeg extends SVGPathHorizontalSeg {
    #y: number;

    public constructor(type: PATH_SEGMENT_TYPE, [x, y]: number[], owningPathSegList?: unknown) {
        super(type, [x], owningPathSegList);
        this.#y = y;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.x} ${this.#y}`;
    }

    public get y(): number {
        return this.#y;
    }

    public set y(value: number) {
        this.#y = value;
        this.segmentChanged();
    }

    public clone(): SVGPathPointSeg {
        return new SVGPathPointSeg(this.pathSegType, [this.x, this.y]);
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathPointSeg {
        return new SVGPathPointSeg(type, data, owningPathSegList);
    }
}
