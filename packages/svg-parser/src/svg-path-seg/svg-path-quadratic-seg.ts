import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathQuadraticSeg extends SVGPathPointSeg {
    #x1: number;

    #y1: number;

    public constructor(type: PATH_SEGMENT_TYPE, owningPathSegList: unknown, x: number, y: number, x1: number, y1: number) {
        super(type, owningPathSegList, x, y);
        this.#x1 = x1;
        this.#y1 = y1;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.#x1} ${this.#y1} ${this.x} ${this.y}`;
    }

    public get x1(): number {
        return this.#x1;
    }

    public set x1(value: number) {
        this.#x1 = value;
        this.segmentChanged();
    }

    public get y1(): number {
        return this.#y1;
    }

    public set y1(value: number) {
        this.#y1 = value;
        this.segmentChanged();
    }
}
