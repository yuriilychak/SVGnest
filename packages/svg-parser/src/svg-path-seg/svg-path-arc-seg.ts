import SVGPathPointSeg from './svg-path-point-seg';
import { PATH_SEGMENT_TYPE } from '../types';

export default class SVGPathArcSeg extends SVGPathPointSeg {
    #r1: number;

    #r2: number;

    #angle: number;

    #largeArcFlag: number;

    #sweepFlag: number;

    public constructor(
        type: PATH_SEGMENT_TYPE,
        [x, y, r1, r2, angle, largeArcFlag, sweepFlag]: number[],
        owningPathSegList?: unknown
    ) {
        super(type, [x, y], owningPathSegList);
        this.#r1 = r1;
        this.#r2 = r2;
        this.#angle = angle;
        this.#largeArcFlag = largeArcFlag;
        this.#sweepFlag = sweepFlag;
    }

    public asPathString(): string {
        return `${this.pathSegTypeAsLetter} ${this.#r1} ${this.#r2} ${this.#angle} ${this.#largeArcFlag ? '1' : '0'} ${
            this.#sweepFlag ? '1' : '0'
        } ${this.x} ${this.y}`;
    }

    public get r1(): number {
        return this.#r1;
    }

    public set r1(value: number) {
        this.#r1 = value;
        this.segmentChanged();
    }

    public get r2(): number {
        return this.#r2;
    }

    public set r2(value: number) {
        this.#r2 = value;
        this.segmentChanged();
    }

    public get angle(): number {
        return this.#angle;
    }

    public set angle(value: number) {
        this.#angle = value;
        this.segmentChanged();
    }

    public get largeArcFlag(): number {
        return this.#largeArcFlag;
    }

    public set largeArcFlag(value: number) {
        this.#largeArcFlag = value;
        this.segmentChanged();
    }

    public get sweepFlag(): number {
        return this.#sweepFlag;
    }

    public set sweepFlag(value: number) {
        this.#sweepFlag = value;
        this.segmentChanged();
    }

    public clone(): SVGPathArcSeg {
        return new SVGPathArcSeg(this.pathSegType, [
            this.x,
            this.y,
            this.r1,
            this.r2,
            this.angle,
            this.largeArcFlag,
            this.sweepFlag
        ]);
    }

    public static create(type: PATH_SEGMENT_TYPE, data: number[], owningPathSegList?: unknown): SVGPathArcSeg {
        return new SVGPathArcSeg(type, data, owningPathSegList);
    }
}
