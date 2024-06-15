import { PATH_TAG } from '../types';
import { PATH_SEGMENT_TYPE } from '../types';
import { TYPE_TO_TAG } from './constants';

// Spec: http://www.w3.org/TR/SVG11/single-page.html#paths-InterfaceSVGPathSeg
export default class SVGPathBaseSeg {
    #owningPathSegList: unknown;

    #pathSegTypeAsLetter: PATH_TAG;

    #pathSegType: PATH_SEGMENT_TYPE;

    public constructor(type: PATH_SEGMENT_TYPE, owningPathSegList?: unknown) {
        this.#pathSegType = type;
        this.#pathSegTypeAsLetter = TYPE_TO_TAG.get(type) as PATH_TAG;
        this.#owningPathSegList = owningPathSegList;
    }

    public clone(): SVGPathBaseSeg {
        return new SVGPathBaseSeg(this.#pathSegType);
    }

    public asPathString(): string {
        return this.#pathSegTypeAsLetter;
    }

    // Notify owning PathSegList on any changes so they can be synchronized back to the path element.
    public segmentChanged(): void {
        if (this.#owningPathSegList) {
            // @ts-ignore
            this.#owningPathSegList.segmentChanged(this);
        }
    }

    public get pathSegType(): PATH_SEGMENT_TYPE {
        return this.#pathSegType;
    }

    public get owningPathSegList(): unknown {
        return this.#owningPathSegList;
    }

    public set owningPathSegList(value: unknown) {
        this.#owningPathSegList = value;
    }

    public get pathSegTypeAsLetter(): PATH_TAG {
        return this.#pathSegTypeAsLetter;
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathBaseSeg {
        return new SVGPathBaseSeg(type, owningPathSegList);
    }
}
