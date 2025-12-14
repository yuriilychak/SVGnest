export type NestConfig = {
    readonly curveTolerance: number;
    readonly spacing: number;
    readonly rotations: number;
    readonly populationSize: number;
    readonly mutationRate: number;
    readonly useHoles: boolean;
};


export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float32Array;
    children: PolygonNode[];
};

export type NFPCache = Map<number, ArrayBuffer>;

export type TypedArray = Float32Array | Float64Array | Uint16Array | Uint8Array | Uint32Array | Int16Array | Int8Array | Int32Array;

export interface Point<T extends TypedArray = TypedArray> {
    bind(data: T, offset?: number): this;

    fromMemSeg(data: ArrayLike<number>, index?: number, offset?: number): this;

    fill(memSeg: TypedArray, index: number, offset?: number): void;

    set(x: number, y: number): this;

    update(point: Point): this;

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

    clone(point?: Point): Point<T>;

    onSegment(pointA: Point, pointB: Point): boolean;

    almostEqual(point: Point, tolerance?: number): boolean;

    almostEqualX(point: Point, tolerance?: number): boolean;

    almostEqualY(point: Point, tolerance?: number): boolean;

    interpolateX(beginPoint: Point, endPoint: Point): number;

    interpolateY(beginPoint: Point, endPoint: Point): number;

    export(): T;

    rangeTest(useFullRange: boolean): boolean;

    closeTo(point: Point, distSqrd: number): boolean

    x: number;

    y: number;

    readonly length: number;

    readonly length2: number;

    readonly isEmpty: boolean;
}

export interface BoundRect<T extends TypedArray> {
    clone(): BoundRect<T>;

    update(position: Point, size: Point): void;

    readonly position: Point<T>;

    readonly size: Point<T>;

    readonly x: number;

    readonly y: number;

    readonly width: number;

    readonly height: number;
}

export interface Polygon<T extends TypedArray = TypedArray> {

    bind(data: T, offset?: number, pointCount?: number): void;

    clean(): void;

    rotate(angle: number): void;

    at(index: number): Point<T> | null;

    pointIn(point: Point, offset?: Point | null): boolean;

    close(): void;

    reverse(): void;

    exportBounds(): BoundRect<T>;

    resetPosition(): void;

    normalize(): T;

    export(): T;

    readonly length: number;

    readonly first: Point<T>;

    readonly last: Point<T>;

    readonly isBroken: boolean;

    readonly isClosed: boolean;

    readonly isRectangle: boolean;

    readonly area: number;

    readonly absArea: number;

    readonly position: Point<T>;

    readonly size: Point<T>;
}

