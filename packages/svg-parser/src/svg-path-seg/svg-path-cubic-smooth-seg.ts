import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathCubicSmoothSeg extends SVGPathPointSeg {
    #x2: number;

    #y2: number;

    public constructor(type: PATH_SEGMENT_TYPE, [x, y, x1, y1]: number[], owningPathSegList?: unknown) {
        super(type, [x, y], owningPathSegList);
        this.#x2 = x1;
        this.#y2 = y1;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.#x2} ${this.#y2} ${this.x} ${this.y}`;
    }

    public get x2(): number {
        return this.#x2;
    }

    public set x2(value: number) {
        this.#x2 = value;
        this.segmentChanged();
    }

    public get y2(): number {
        return this.#y2;
    }

    public set y2(value: number) {
        this.#y2 = value;
        this.segmentChanged();
    }

    public clone(): SVGPathCubicSmoothSeg {
        return new SVGPathCubicSmoothSeg(this.pathSegType, [this.x, this.y, this.x2, this.y2]);
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathCubicSmoothSeg {
        return new SVGPathCubicSmoothSeg(type, data, owningPathSegList);
    }
}
