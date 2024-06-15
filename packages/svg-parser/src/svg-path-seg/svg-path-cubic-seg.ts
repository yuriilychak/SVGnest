import SVGPathQuadraticSeg from './svg-path-quadratic-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathCubicSeg extends SVGPathQuadraticSeg {
    #x2: number;

    #y2: number;

    constructor(type: PATH_SEGMENT_TYPE, [x, y, x1, y1, x2, y2]: number[], owningPathSegList?: unknown) {
        super(type, [x, y, x1, y1], owningPathSegList);
        this.#x2 = x2;
        this.#y2 = y2;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.x1} ${this.y1} ${this.#x2} ${this.#y2} ${this.x} ${this.y}`;
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

    public clone(): SVGPathCubicSeg {
        return new SVGPathCubicSeg(this.pathSegType, [this.x, this.y, this.x1, this.y1, this.x2, this.y2]);
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathCubicSeg {
        return new SVGPathCubicSeg(type, data, owningPathSegList);
    }
}
