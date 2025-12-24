export type NestConfig = {
    curveTolerance: number;
    spacing: number;
    rotations: number;
    populationSize: number;
    mutationRate: number;
    useHoles: boolean;
};

export enum THREAD_TYPE {
    PLACEMENT = 1,
    PAIR = 0
}

export type NFPCache = Map<number, ArrayBuffer>;

export interface BoundRect<T extends TypedArray> {
    clone(): BoundRect<T>;

    from(rect: BoundRect<T>): void;

    clean(): void;

    readonly x: number;

    readonly y: number;

    readonly width: number;

    readonly height: number;
}

export type PlacementData = {
    placementsData: Float32Array;
    nodes: PolygonNode[];
    bounds: BoundRect<Float32Array>;
    angleSplit: number;
};

export type DisplayCallback = (
    placementsData: PlacementData,
    placePerecntage: number,
    lacedParts: number,
    partCount: number
) => void;

export type PolygonNode = {
    source: number;
    rotation: number;
    memSeg: Float32Array;
    children: PolygonNode[];
};

export type CalculateConfig = { pointPool: unknown; isInit: boolean };

export type TypedArray = Float32Array | Float64Array | Uint16Array | Uint8Array | Uint32Array | Int16Array | Int8Array | Int32Array;