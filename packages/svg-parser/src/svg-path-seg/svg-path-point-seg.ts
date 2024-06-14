import SVGBasePathSeg from './svg-base-path-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathPointSeg extends SVGBasePathSeg {
    #x: number;

    #y: number;

    public constructor(type: PATH_SEGMENT_TYPE, owningPathSegList: unknown, x: number, y: number) {
        super(type, owningPathSegList);
        this.#x = x;
        this.#y = y;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.#x} ${this.#y}`;
    }

    public get x(): number {
        return this.#x;
    }

    public set x(value: number) {
        this.#x = value;
        this.segmentChanged();
    }

    public get y(): number {
        return this.#y;
    }

    public set y(value: number) {
        this.#y = value;
        this.segmentChanged();
    }
}
