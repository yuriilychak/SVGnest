export type NestConfig = {
    readonly curveTolerance: number;
    readonly spacing: number;
    readonly rotations: number;
    readonly populationSize: number;
    readonly mutationRate: number;
    readonly useHoles: boolean;
};

export type DisplayCallback = (placement: string, placePerecntage: number, lacedParts: number, partCount: number) => void;

export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float32Array;
    children: PolygonNode[];
};

export type NFPCache = Map<number, ArrayBuffer>;

export enum THREAD_TYPE {
    PLACEMENT = 1,
    PAIR = 0
}

export type TypedArray = Float32Array | Float64Array | Uint16Array | Uint8Array | Uint32Array | Int16Array | Int8Array | Int32Array;

export interface Point<T extends TypedArray = TypedArray> {
    bind(data: T, offset?: number): this;

    fromMemSeg(data: ArrayLike<number>, index?: number, offset?: number): this;

    fill(memSeg: T, index: number, offset?: number): void;

    set(x: number, y: number): this;

    update(point: Point): this;

    fromClipper(point: Point): this;

    add(point: Point): this;

    sub(point: Point): this

    mul(point: Point): this;

    scaleUp(value: number): this;

    scaleDown(value: number): this;

    max(point: Point): this;

    min(point: Point): this;

    rotate(angle: number): this;

    cross(point: Point): number;

    dot(point: Point): number;

    getBetween(point1: Point, point2: Point): boolean;

    len2(point: Point): number;

    len(point: Point): number;

    normalize(): this;

    round(): this;

    clipperRound(): this;

    normal(): this

    reverse(): this;

    onSegment(pointA: Point, pointB: Point): boolean;

    almostEqual(point: Point, tolerance?: number): boolean;

    interpolateX(beginPoint: Point, endPoint: Point): number;

    interpolateY(beginPoint: Point, endPoint: Point): number;

    export(): T;

    x: number;

    y: number;

    readonly length: number;

    readonly length2: number;

    readonly isEmpty: boolean;
}

