import SVGBasePathSeg from './svg-base-path-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathVerticalSeg extends SVGBasePathSeg {
    #y: number;

    public constructor(type: PATH_SEGMENT_TYPE, owningPathSegList: unknown, y: number) {
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
}
